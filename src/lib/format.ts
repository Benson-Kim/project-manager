/** Fixed locale so server and client render identical dates (no hydration drift). */
export function formatDate(value: Date | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(value);
}

/**
 * Format a Date or ISO date string (or null/undefined) as YYYY-MM-DD for
 * `<input type="date">`. Accepts strings to handle pre-serialised values from
 * server-component props without requiring a re-parse at the call site.
 */
export function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
