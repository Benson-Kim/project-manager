import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import {
  auditUnknownUsernameLoginFailure,
  getUserByUsername,
  recordIpLoginAttempt,
  recordLoginAttempt,
} from "@/modules/auth/repository/users";
import { loginInput } from "@/modules/auth/schemas/user";
import { getEnv } from "@/lib/env";
import { getUserPreference } from "@/lib/repositories/user-preference";
import { DEFAULT_IDLE_TIMEOUT_MINUTES, isIdleExpired } from "./idle-timeout";
import { verifyPassword } from "./password";
import type { Role } from "./types";

/**
 * Auth.js v5 configuration : credentials provider + JWT session
 * strategy with a SessionVersion revocation stamp (no DB session table).
 * authorize() is the single login gatekeeper: IP fixed-window rate limit
 * (5/min, usp_LoginAttempt_Record), per-user lockout with backoff
 * (usp_User_RecordLoginAttempt — which also writes the Login/LoginFailed
 * audit rows in-proc), argon2id verification. Every failure returns null so
 * Auth.js surfaces ONE generic message — whether the username exists is never
 * revealed.
 */

/** Auth.js keeps this in the encrypted JWT; the app-facing contract stays src/lib/auth/types.ts. */
export interface AppToken {
  userId: number;
  username: string;
  role: Role;
  sessionVersion: number;
  mustChangePassword: boolean;
  /** Absent on tokens minted before migration 060: the default and the token's iat stand in. */
  idleTimeoutMinutes?: number;
  lastActiveAt?: number;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Attempts per minute from one client address (STANDARDS §4). */
export const KNOWN_IP_LOGIN_LIMIT = 5;
/**
 * When no client address is known (no trusted proxy: direct, Compose, the
 * desktop) every client shares one window. 5 would let one wrong password lock
 * the whole office out for a minute; 60 still stops scripted guessing while the
 * per-user lockout stays the primary control (ADR-0031).
 */
export const SHARED_LOGIN_LIMIT = 60;
/**
 * An argon2id hash of a random string, verified when the username is unknown so
 * the response takes as long as for a known one: timing no longer tells valid
 * usernames apart (ADR-0031). Not a secret; nothing ever matches it.
 */
export const UNKNOWN_USER_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$PCJEALieHd5bIPI5XWhTZg$c2HxtJMVUF1O4LbIOzDHRUFrclONLViFwsiFyJv3ivQ";

function requireAuthSecret(): void {
  const secret = process.env.AUTH_SECRET;
  // STANDARDS §4: >= 32 random bytes, provided via CI/CD variables / host env
  // only. Checked at first use so `next build` needs no secrets.
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 random characters");
  }
}

/**
 * Derive the real client IP from the request, trusting exactly
 * `TRUSTED_PROXY_COUNT` hops from the right of the X-Forwarded-For chain.
 *
 * Why rightmost-N? Each hop in the chain is appended by the hop itself:
 *   Client → Proxy1 → Proxy2 → App
 *   X-Forwarded-For: <client>, <proxy1>     (Proxy2 appended <proxy1>; App sees this)
 *
 * Addresses appended by proxies we control are trustworthy; addresses supplied
 * by the client or by upstream infrastructure we don't control are not. With
 * TRUSTED_PROXY_COUNT=1 we drop the rightmost 1 address (set by our proxy) and
 * take the next one — that is what our proxy recorded as the incoming address.
 * With TRUSTED_PROXY_COUNT=0 we ignore XFF entirely; any value there was set by
 * the client or an untrusted intermediary.
 *
 * Exported for unit tests.
 */
export function getTrustedIp(headers: Headers | undefined, trustedProxyCount: number): string {
  if (trustedProxyCount <= 0) return "unknown";
  const xff = headers?.get("x-forwarded-for");
  if (!xff) return "unknown";
  const addrs = xff
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Strip the rightmost `trustedProxyCount` entries (our own proxy hops).
  // The candidate is the entry immediately before them.
  const candidateIndex = addrs.length - trustedProxyCount - 1;
  const ip = addrs[candidateIndex];
  // Reject empty or obviously invalid values — fall back to unknown.
  return ip && ip.length > 0 ? ip : "unknown";
}

/** Exported for unit tests: the single login gatekeeper (see module JSDoc). */
export async function authorizeCredentials(
  credentials: unknown,
  request: { headers?: Headers },
): Promise<{ id: string; appToken: AppToken } | null> {
  requireAuthSecret();

  const parsed = loginInput.safeParse(credentials);
  if (!parsed.success) return null;
  const { username, password } = parsed.data;

  const { TRUSTED_PROXY_COUNT } = getEnv();
  const ip = getTrustedIp(request.headers, TRUSTED_PROXY_COUNT);

  // 1. Fixed-window IP rate limit — deny before any credential work.
  const rate = await recordIpLoginAttempt(
    ip,
    ip === "unknown" ? SHARED_LOGIN_LIMIT : KNOWN_IP_LOGIN_LIMIT,
  );
  if (!rate.Allowed) return null;

  // 2. Lookup. Unknown username still audits a LoginFailed row, after a
  // verification that costs the same as a real one.
  const user = await getUserByUsername(username);
  if (!user) {
    await verifyPassword(UNKNOWN_USER_HASH, password);
    await auditUnknownUsernameLoginFailure(ip);
    return null;
  }

  // 3. Per-user lockout (backoff computed in-proc on failures).
  if (user.LockedUntilUtc && user.LockedUntilUtc.getTime() > Date.now()) {
    return null;
  }

  // 4. Verify argon2id hash, then record the outcome (in-proc audit).
  const ok = await verifyPassword(user.PasswordHash, password);
  if (!ok || !user.IsActive) {
    await recordLoginAttempt(user.UserId, false, ip);
    return null;
  }
  await recordLoginAttempt(user.UserId, true, ip);
  const preference = await getUserPreference(user.UserId).catch(() => null);

  return {
    // Auth.js requires a string id; the numeric id travels in appToken.
    id: String(user.UserId),
    appToken: {
      userId: user.UserId,
      username: user.Username,
      role: user.RoleName,
      sessionVersion: user.SessionVersion,
      mustChangePassword: user.MustChangePassword,
      idleTimeoutMinutes: preference?.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES,
      lastActiveAt: nowSeconds(),
    } satisfies AppToken,
  };
}

export const {
  handlers,
  auth,
  signIn,
  signOut,
  unstable_update: updateSession,
} = NextAuth({
  session: {
    strategy: "jwt",
    // The cap for an idle sign-out of Never; each user's shorter idle time is
    // enforced in the jwt callback and the proxy.
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  // Required by Auth.js to serve at all; its URLs come from AUTH_URL (set by
  // Compose and the desktop host, ADR-0032), not from the Host header.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        username: {},
        password: {},
      },
      authorize: (credentials, request) => authorizeCredentials(credentials, request),
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user && "appToken" in user) {
        token.appToken = user.appToken as AppToken;
        return token;
      }
      const appToken = token.appToken;
      if (!appToken) return token;
      const now = nowSeconds();
      const idleTimeoutMinutes = appToken.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES;
      // Checked before an update too, so POSTing to the session route cannot revive an idle session.
      if (isIdleExpired(appToken.lastActiveAt ?? token.iat ?? 0, idleTimeoutMinutes, now)) {
        return null;
      }
      // An update only signals "reload": the value comes from the database, never the request body.
      const preference =
        trigger === "update" ? await getUserPreference(appToken.userId).catch(() => null) : null;
      token.appToken = {
        ...appToken,
        idleTimeoutMinutes: preference?.idleTimeoutMinutes ?? idleTimeoutMinutes,
        lastActiveAt: now,
      };
      return token;
    },
    session({ session, token }) {
      if (token.appToken) {
        session.appToken = token.appToken as AppToken;
      }
      return session;
    },
  },
});
