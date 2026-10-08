/**
 * Formatting utilities — pure functions, no side-effects.
 * Centralised here so all modules use the same locale/timezone conventions.
 */

/**
 * Format a date for display (e.g. "Mar 15, 2026").
 * Returns an empty string when the value is null, undefined or invalid so
 * callers can render it directly without a separate null-check.
 */
export function formatDate(value: Date | string | null | undefined): string {
  if (value == null) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  // Use en-US for stable month abbreviations (no trailing period) across all environments.
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Convert a Date (or ISO string) to the YYYY-MM-DD string expected by
 * <input type="date">. Returns an empty string for null/undefined so the
 * input renders as empty (not "Invalid Date").
 */
export function toDateInput(value: Date | string | null | undefined): string {
  if (value == null) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  // Use UTC parts to avoid local-timezone day-shift.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
