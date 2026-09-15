import { AppError } from "../errors";
import { auth as authJs } from "./config";
import { getSessionStamp } from "./session-stamp";
import type { AuthProvider, Session } from "./types";

/**
 * Auth.js-backed provider (module #4; replaces the ADR-0015 dev stub — the
 * AUTH_DEV_BYPASS path is gone). The contract in ./types.ts is unchanged: all
 * call sites (action wrapper, pages) keep working, but sessions are now real
 * JWTs whose SessionVersion stamp is re-checked against the database on every
 * request (ADR-0017 revocation).
 */
export const auth: AuthProvider = {
  async getSession(): Promise<Session | null> {
    const session = await authJs();
    const token = session?.appToken;
    if (!token) return null;

    const stamp = await getSessionStamp(token.userId);
    if (!stamp || !stamp.isActive || stamp.sessionVersion !== token.sessionVersion) {
      return null; // revoked, deactivated or deleted — treat as signed out
    }

    return { userId: token.userId, username: token.username, role: token.role };
  },
  async requireSession(): Promise<Session> {
    const session = await auth.getSession();
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in to continue");
    return session;
  },
};
