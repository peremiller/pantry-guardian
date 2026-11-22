import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Execute the production route's actual TS-compiled handlers with only its
// external dependencies replaced. No network or database connection is made.
const source = await readFile(new URL("../app/api/donations/route.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "route.ts",
}).outputText.replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");

function handlers({ vercel = false, getOpenAI = async () => { throw new Error("OPENAI_API_KEY missing"); }, mockDatabase = null } = {}) {
  // The real route executes; only the D1 dependency is substituted for this case.
  const runnable = mockDatabase
    ? js.replace("async function d1() {", "async function unusedProductionD1() {") + "\nconst d1 = async () => mockDatabase;"
    : js;
  const create = new Function("process", "Response", "getOpenAI", "mockDatabase", "eq", runnable + "\nreturn { POST, PATCH };");
  return create({ env: { VERCEL: vercel ? "1" : "0" } }, Response, getOpenAI, mockDatabase, (field, id) => ({ field, id }));
}
const today = new Date().toISOString().slice(0, 10);
const safePayload = {
  foodName: "Cooked rice", quantity: "one container", expiryDate: today,
  pickupArea: "City center", safeToShare: true, status: "Available",
};
const postRequest = () => new Request("https://localhost/api/donations", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify(safePayload),
});
const patchRequest = () => new Request("https://localhost/api/donations", {
  method: "PATCH", headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: 1 }),
});

test("ephemeral Vercel deployment never acknowledges durable public donation writes", async () => {
  const { POST, PATCH } = handlers({ vercel: true });
  for (const response of [await POST(postRequest()), await PATCH(patchRequest())]) {
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /durable community storage/i);
  }
});

test("missing moderation credential fails closed and preserves client donation drafts", async () => {
  const { POST } = handlers();
  const response = await POST(postRequest());
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /safety screening/i);
});

test("missing moderation verdict never silently publishes a listing", async () => {
  const { POST } = handlers({ getOpenAI: async () => ({
    client: { moderations: { create: async () => ({ results: [] }) } },
  }) });
  const response = await POST(postRequest());
  assert.equal(response.status, 503);
});

test("flagged content is rejected before storage is accessed", async () => {
  const { POST } = handlers({ getOpenAI: async () => ({
    client: { moderations: { create: async () => ({ results: [{ flagged: true }] }) } },
  }) });
  const response = await POST(postRequest());
  assert.equal(response.status, 400);
});

test("invalid safety confirmation cannot reach moderation or storage", async () => {
  let invoked = false;
  const { POST } = handlers({ getOpenAI: async () => { invoked = true; throw Error("unexpected"); } });
  const response = await POST(new Request("https://localhost/api/donations", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...safePayload, safeToShare: false }),
  }));
  assert.equal(response.status, 400);
  assert.equal(invoked, false);
});

test("invalid and normalized calendar dates are rejected before public moderation or persistence", async () => {
  let called = false;
  const { POST } = handlers({ getOpenAI: async () => {
    called = true;
    throw Error("Unsafe date reached moderation");
  } });
  for (const expiryDate of [
    "2026-02-30", "2025-02-29", "2026-11-31",
    "2026-13-01", "2026-2-03", "not-a-date", "2026-02-20T00:00:00Z",
  ]) {
    const request = new Request("https://localhost/api/donations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...safePayload, expiryDate }),
    });
    const response = await POST(request);
    assert.equal(response.status, 400, `Expiry ${expiryDate} should be rejected`);
    assert.match((await response.json()).error, /expired food/i);
  }
  assert.equal(called, false, "Invalid dates must not reach moderation or the database");
});


test("invalid JSON bodies and non-object donations fail closed before moderation", async () => {
  let moderationCalled = false;
  const { POST } = handlers({ getOpenAI: async () => {
    moderationCalled = true;
    throw Error("Unexpected moderation");
  } });
  for (const body of ["null", "[]", '"text"', "{bad-json", ""]) {
    const request = new Request("https://localhost/api/donations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const response = await POST(request);
    assert.equal(response.status, 400, "Invalid donation body should receive 400");
    assert.match((await response.json()).error, /valid donation object/i);
  }
  assert.equal(moderationCalled, false);
});

test("unsafe claim IDs and malformed PATCH JSON return 400 without database access", async () => {
  const { PATCH } = handlers();
  for (const body of ["null", "[]", "{bad-json", "{}", '{"id":0}', '{"id":-1}', '{"id":1.2}', '{"id":"1"}', '{"id":9007199254740992}']) {
    const request = new Request("https://localhost/api/donations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body,
    });
    const response = await PATCH(request);
    assert.equal(response.status, 400, "Invalid claim must not reach D1");
    assert.match((await response.json()).error, /valid donation/i);
  }
});

test("claiming a missing donation returns 404 and cannot report a successful claim", async () => {
  let writes = 0;
  const db = {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => { writes++; return []; },
        }),
      }),
    }),
  };
  const { PATCH } = handlers({ mockDatabase: { db, pantryDonations: { id: "id" } } });
  const response = await PATCH(patchRequest());
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /not found/i);
  assert.equal(writes, 1, "Only the requested claim lookup should be attempted");
});
