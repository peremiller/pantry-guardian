/** A browser-local calendar date, without a UTC timezone shift. */
export function localCalendarDate(now = new Date()) {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

// Date.parse silently normalizes some invalid dates (e.g. Feb 30 to Mar 2).
// An invalid expiration must never be treated as a usable food date.
function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const instant = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}

/** Count calendar days; daylight-saving changes do not create fractional days. */
export function daysRemaining(expiry, reference) {
  if (!isCalendarDate(expiry) || !isCalendarDate(reference)) return NaN;
  return Math.round((Date.parse(expiry + "T00:00:00Z") - Date.parse(reference + "T00:00:00Z")) / 86400000);
}

export function dateAfter(reference, days) {
  if (!isCalendarDate(reference) || !Number.isInteger(days)) {
    throw new RangeError("A valid calendar date and a whole number of days are required");
  }
  const value = new Date(reference + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Expired items stay in inventory, but are excluded from rescue recommendations. */
export function isUsableSoon(expiry, reference, windowDays = 7) {
  const remaining = daysRemaining(expiry, reference);
  return remaining >= 0 && remaining <= windowDays;
}
