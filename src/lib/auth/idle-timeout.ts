import { z } from "zod";

/**
 * Idle sign-out (migration 060). One rule shared by the
 * Auth.js jwt callback, the proxy and the browser's idle watcher, so it holds
 * no server-only imports. Minutes; 0 = Never.
 */
export const NEVER_IDLE_TIMEOUT = 0;
export const IDLE_TIMEOUT_OPTIONS = [15, 30, 60, 120, 240, 480, NEVER_IDLE_TIMEOUT] as const;
export const DEFAULT_IDLE_TIMEOUT_MINUTES = 480;

/** No coercion: null or "" must never turn into 0 = Never, the least safe choice. */
export const idleTimeoutInput = z.object({
  idleTimeoutMinutes: z
    .number()
    .int()
    .refine((minutes) => (IDLE_TIMEOUT_OPTIONS as readonly number[]).includes(minutes)),
});

/** `lastActiveAt` and `nowSeconds` are epoch seconds, like the JWT's own iat/exp. */
export function isIdleExpired(
  lastActiveAt: number,
  idleTimeoutMinutes: number,
  nowSeconds: number,
): boolean {
  if (idleTimeoutMinutes === NEVER_IDLE_TIMEOUT) return false;
  return nowSeconds - lastActiveAt > idleTimeoutMinutes * 60;
}
