/**
 * Wall-clock time (to-do alerts): AlertDay/AlertTime are the user's local date
 * and time as typed, so "is it due?" compares them with the browser's local
 * "now", sent as a zone-less ISO string. On the server it becomes a Date whose
 * UTC fields hold the wall-clock values, which the mssql driver (UTC mode)
 * passes to DATETIME2 unchanged. The procs only trust it within 14 hours of UTC.
 */

/** The shape localWallClock() sends; schemas that take one validate with it. */
export const LOCAL_WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

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
  if (!raw || !LOCAL_WALL_CLOCK.test(raw)) return null;
  const date = new Date(`${raw}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The wall clock in an IANA time zone as a Date whose UTC fields hold those values; null for an unknown zone. */
export function wallClockInZone(timeZone: string, now: Date = new Date()): Date | null {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value;
    const match = /^GMT(?:([+-])(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(name ?? "");
    if (!match) return null;
    const [, sign, hours = "0", minutes = "0", seconds = "0"] = match;
    const offsetSeconds =
      (sign === "-" ? -1 : 1) * (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds));
    return new Date((Math.floor(now.getTime() / 1000) + offsetSeconds) * 1000);
  } catch {
    return null;
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export interface TimeZoneSources {
  override?: string | null;
  system?: string;
  onInvalidOverride?: (override: string) => void;
}

/** The override when it is a valid IANA zone, otherwise the PC's own zone (UTC if the PC reports none). */
export function resolveTimeZone(sources: TimeZoneSources = {}): string {
  const system = sources.system ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fallback = system && isValidTimeZone(system) ? system : "UTC";
  const override = sources.override?.trim();
  if (!override) return fallback;
  if (isValidTimeZone(override)) return override;
  sources.onInvalidOverride?.(override);
  return fallback;
}
