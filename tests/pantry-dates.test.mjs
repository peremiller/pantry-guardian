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

test("invalid calendar dates can never count as usable food", () => {
  for (const invalid of ["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-05", "not-a-date", "2026-1-1", "2026-10-09T00:00:00Z", "", null]) {
    assert.equal(Number.isNaN(daysRemaining(invalid, "2026-03-01")), true, String(invalid));
    assert.equal(isUsableSoon(invalid, "2026-03-01"), false, String(invalid));
  }
  assert.equal(daysRemaining("2028-02-29", "2028-02-28"), 1);
  assert.equal(isUsableSoon("2028-02-29", "2028-02-28"), true);
});

test("invalid reference dates fail closed without silently rolling forward", () => {
  assert.equal(Number.isNaN(daysRemaining("2026-03-01", "2026-02-30")), true);
  assert.equal(isUsableSoon("2026-03-01", "2026-02-30"), false);
  assert.throws(() => dateAfter("2026-02-30", 1), RangeError);
  assert.throws(() => dateAfter("2026-03-01", 1.5), RangeError);
});
