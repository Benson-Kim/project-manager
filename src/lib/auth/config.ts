import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import {
  auditUnknownUsernameLoginFailure,
  getUserByUsername,
  recordIpLoginAttempt,
  recordLoginAttempt,
} from "@/modules/auth/repository/users";
import { loginInput } from "@/modules/auth/schemas/user";
import { verifyPassword } from "./password";
import type { Role } from "./types";

/**
 * Auth.js v5 configuration (ADR-0017): credentials provider + JWT session
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
      async authorize(credentials, request) {
        requireAuthSecret();

        const parsed = loginInput.safeParse(credentials);
        if (!parsed.success) return null;
        const { username, password } = parsed.data;

        const ip =
          request.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

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
      },
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
