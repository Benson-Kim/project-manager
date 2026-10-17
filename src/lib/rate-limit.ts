/**
 * In-process fixed-window limits per user (ADR-0031). The app runs as one
 * process per deployment (one container, one desktop install), so a
 * process-local counter is exact; it resets on restart, which abuse control
 * can live with. Limits are per minute and per user id, read from the
 * environment at each call so an operator can tune them without a rebuild;
 * 0 turns a limit off.
 */

export interface RateLimitVerdict {
  allowed: boolean;
  /** Seconds until the window turns over; 0 when allowed. */
  retryAfterSeconds: number;
}

export const RATE_LIMITS = {
  /** Every Server Action (src/lib/action.ts). */
  actions: { env: "RATE_LIMIT_ACTIONS_PER_MINUTE", fallback: 240 },
  /** CSV and PDF route handlers. */
  exports: { env: "RATE_LIMIT_EXPORTS_PER_MINUTE", fallback: 20 },
} as const;

export type RateLimitKind = keyof typeof RATE_LIMITS;

const WINDOW_MS = 60_000;
const MAX_TRACKED = 10_000;

const windows = new Map<string, { start: number; count: number }>();

/** The configured limit of a kind: a whole number ≥ 0, else the fallback. */
export function limitFor(kind: RateLimitKind): number {
  const { env, fallback } = RATE_LIMITS[kind];
  const raw = process.env[env];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

/** Counts one request against `key` in the current minute. */
export function takeSlot(key: string, limit: number, now = Date.now()): RateLimitVerdict {
  if (limit <= 0) return { allowed: true, retryAfterSeconds: 0 };
  const start = now - (now % WINDOW_MS);
  let window = windows.get(key);
  if (!window || window.start !== start) {
    if (windows.size >= MAX_TRACKED) purge(now);
    window = { start, count: 0 };
    windows.set(key, window);
  }
  window.count += 1;
  const allowed = window.count <= limit;
  return {
    allowed,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((start + WINDOW_MS - now) / 1000)),
  };
}

/** One request of `kind` by a user. */
export function takeUserSlot(
  kind: RateLimitKind,
  userId: number,
  now = Date.now(),
): RateLimitVerdict {
  return takeSlot(`${kind}:${userId}`, limitFor(kind), now);
}

/** Tests only. */
export function resetRateLimits(): void {
  windows.clear();
}

function purge(now: number): void {
  for (const [key, window] of windows) {
    if (window.start + WINDOW_MS <= now) windows.delete(key);
  }
}
