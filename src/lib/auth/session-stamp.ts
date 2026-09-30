import { getUserById } from "@/modules/auth/repository/users";
import { isAppError } from "../errors";

/**
 * SessionVersion revocation stamp : JWTs carry the SessionVersion
 * they were minted with; every request re-reads the current value so bumping
 * it (password change, role change, deactivation, admin revoke) kills all
 * outstanding sessions on their next request.
 */
export interface SessionStamp {
  sessionVersion: number;
  isActive: boolean;
  mustChangePassword: boolean;
}

export async function getSessionStamp(userId: number): Promise<SessionStamp | null> {
  try {
    const user = await getUserById(userId, userId);
    return {
      sessionVersion: user.SessionVersion,
      isActive: user.IsActive,
      mustChangePassword: user.MustChangePassword,
    };
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") return null;
    throw err;
  }
}
