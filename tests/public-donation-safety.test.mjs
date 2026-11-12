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

function handlers({ vercel = false, getOpenAI = async () => { throw new Error("OPENAI_API_KEY missing"); } } = {}) {
  const create = new Function("process", "Response", "getOpenAI", js + "\nreturn { POST, PATCH };");
  return create({ env: { VERCEL: vercel ? "1" : "0" } }, Response, getOpenAI);
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
