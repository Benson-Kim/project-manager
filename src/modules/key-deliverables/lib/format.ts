/** Fixed locale so server and client render identical dates (no hydration drift). */
export function formatDate(value: Date | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(value);
}
