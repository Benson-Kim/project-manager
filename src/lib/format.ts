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
 * A file size for display, in the units Windows Explorer uses (1 KB = 1024
 * bytes): "820 bytes", "14 KB", "2.4 MB". Empty for null/undefined.
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${units[unit]}`;
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
