/** A browser-local calendar date, without a UTC timezone shift. */
export function localCalendarDate(now = new Date()) {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

/** Count calendar days; daylight-saving changes do not create fractional days. */
export function daysRemaining(expiry, reference) {
  return Math.round((Date.parse(expiry + "T00:00:00Z") - Date.parse(reference + "T00:00:00Z")) / 86400000);
}

export function dateAfter(reference, days) {
  const value = new Date(reference + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Expired items stay in inventory, but are excluded from rescue recommendations. */
export function isUsableSoon(expiry, reference, windowDays = 7) {
  const remaining = daysRemaining(expiry, reference);
  return remaining >= 0 && remaining <= windowDays;
}
