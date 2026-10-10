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
}

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
  const rate = await recordIpLoginAttempt(ip);
  if (!rate.Allowed) return null;

  // 2. Lookup. Unknown username still audits a LoginFailed row.
  const user = await getUserByUsername(username);
  if (!user) {
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

  return {
    // Auth.js requires a string id; the numeric id travels in appToken.
    id: String(user.UserId),
    appToken: {
      userId: user.UserId,
      username: user.Username,
      role: user.RoleName,
      sessionVersion: user.SessionVersion,
      mustChangePassword: user.MustChangePassword,
    } satisfies AppToken,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 h idle expiry (STANDARDS §4)
  },
  pages: {
    signIn: "/login",
  },
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
    jwt({ token, user }) {
      if (user && "appToken" in user) {
        token.appToken = user.appToken as AppToken;
      }
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
