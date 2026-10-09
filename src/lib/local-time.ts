/**
 * Wall-clock time (to-do alerts): AlertDay/AlertTime are the user's local date
 * and time as typed, so "is it due?" compares them with the browser's local
 * "now", sent as a zone-less ISO string. On the server it becomes a Date whose
 * UTC fields hold the wall-clock values, which the mssql driver (UTC mode)
 * passes to DATETIME2 unchanged. The procs only trust it within 14 hours of UTC.
 */

const LOCAL_NOW = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

const pad = (n: number) => String(n).padStart(2, "0");

/** The browser's wall clock as "YYYY-MM-DDTHH:mm:ss" (no zone). */
export function localWallClock(date: Date = new Date()): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** A wall-clock string from the client as a Date for a DATETIME2 parameter; null when malformed. */
export function parseLocalWallClock(raw: string | null | undefined): Date | null {
  if (!raw || !LOCAL_NOW.test(raw)) return null;
  const date = new Date(`${raw}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
