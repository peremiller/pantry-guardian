import assert from "node:assert/strict";
import test from "node:test";
import { dateAfter, daysRemaining, isUsableSoon, localCalendarDate } from "../lib/pantry-dates.mjs";

test("expiry windows exclude yesterday and include today through seven days", () => {
  assert.equal(isUsableSoon("2026-10-08", "2026-10-09"), false);
  assert.equal(isUsableSoon("2026-10-09", "2026-10-09"), true);
  assert.equal(isUsableSoon("2026-10-16", "2026-10-09"), true);
  assert.equal(isUsableSoon("2026-10-17", "2026-10-09"), false);
});

test("calendar arithmetic handles leap years and daylight-saving boundaries", () => {
  assert.equal(dateAfter("2028-02-28", 2), "2028-03-01");
  assert.equal(daysRemaining("2026-03-09", "2026-03-08"), 1);
  assert.equal(daysRemaining("2026-11-02", "2026-11-01"), 1);
  assert.equal(localCalendarDate(new Date(2026, 9, 9, 23, 59)), "2026-10-09");
});

test("sample dates remain relative to the first opening day", () => {
  const sampleOffset = daysRemaining("2026-07-19", "2026-07-18");
  assert.equal(dateAfter("2026-10-09", sampleOffset), "2026-10-10");
});
