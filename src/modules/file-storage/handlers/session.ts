import { auth as authJs } from "@/lib/auth/config";
import { auth } from "@/lib/auth/provider";
import type { Session } from "@/lib/auth/types";

/**
 * The session for /api/files (ADR-0026 §3). Those routes bypass the proxy, so
 * they also apply its one extra rule: an account that must still change its
 * password gets nothing but /change-password. Server only.
 */
export async function getFileSession(): Promise<Session | null> {
  const session = await auth.getSession();
  if (!session) return null;
  const raw = await authJs();
  return raw?.appToken?.mustChangePassword ? null : session;
}
