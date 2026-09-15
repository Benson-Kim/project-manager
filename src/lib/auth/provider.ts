import { AppError } from "../errors";
import type { AuthProvider, Session } from "./types";

/**
 * DEV-STUB provider (ADR-0015) — replaced by Auth.js in module #4 (issue #4
 * tracks the swap; this file is the only replacement point).
 *
 * Behaviour: with AUTH_DEV_BYPASS=1 (docker-compose / local dev ONLY) every
 * request is an Admin dev session so foundation primitives and module work can
 * proceed before #4. Without the flag there is no session — mutations are
 * rejected, which is the safe default anywhere real.
 */
const devSession: Session = { userId: 1, username: "dev", role: "Admin" };

export const auth: AuthProvider = {
  getSession() {
    return Promise.resolve(process.env.AUTH_DEV_BYPASS === "1" ? devSession : null);
  },
  async requireSession() {
    const session = await auth.getSession();
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in to continue");
    return session;
  },
};
