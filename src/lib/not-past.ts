import { LOCAL_WALL_CLOCK, localWallClock } from "@/lib/local-time";

const TRUSTED_SPREAD_MS = 14 * 3_600_000;

/**
 * The user's wall clock as "YYYY-MM-DDTHH:mm": the localNow the browser sent,
 * trusted within 14 hours of UTC as the procs do, else this machine's clock.
 */
export function userNow(localNow: string | null | undefined, now: Date = new Date()): string {
  const fallback = localWallClock(now).slice(0, 16);
  if (!localNow || !LOCAL_WALL_CLOCK.test(localNow)) return fallback;
  const sent = Date.parse(`${localNow}Z`);
  if (Number.isNaN(sent) || Math.abs(sent - now.getTime()) > TRUSTED_SPREAD_MS) return fallback;
  return localNow.slice(0, 16);
}

/** A "YYYY-MM-DD" day before the user's today. */
export function isPastDay(day: string, now: string): boolean {
  return day < now.slice(0, 10);
}

/** A "YYYY-MM-DDTHH:mm" time before the user's current minute. */
export function isPastMinute(at: string, now: string): boolean {
  return at < now.slice(0, 16);
}
