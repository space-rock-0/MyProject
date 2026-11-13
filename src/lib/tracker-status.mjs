// Canonical statuses for the local job-tracker table, shared by the routes.
// Mirrors the job-tracker UI dropdown (minus the "ALL" filter pseudo-status)
// and the analytics buckets. Anything else is rejected at the write boundary.

export const TRACKER_STATUSES = [
  "INBOX",
  "EVALUATED",
  "APPLIED",
  "RESPONDED",
  "ASSESSMENT",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
  "DISCARDED",
  "SKIP",
];

const STATUS_SET = new Set(TRACKER_STATUSES);

/** Canonical uppercase form, or null when it is not a known status. */
export function normalizeTrackerStatus(raw) {
  if (typeof raw !== "string") return null;
  const up = raw.trim().toUpperCase();
  return STATUS_SET.has(up) ? up : null;
}

/** Lenient form for LLM/import paths: unknown input becomes the fallback. */
export function coerceTrackerStatus(raw, fallback = "INBOX") {
  return normalizeTrackerStatus(raw) ?? fallback;
}

/** Strict form for API writes: unknown input is rejected. */
export function parseTrackerStatus(raw) {
  return normalizeTrackerStatus(raw);
}

/** Loose YYYY-MM-DD check (also rejects 2026-13-45 style impossibilities). */
export function isISODate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
