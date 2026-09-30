/**
 * Final auth contract ). Module #4 replaces the provider
 * implementation (src/lib/auth/provider.ts) with Auth.js — this file and all
 * call sites stay unchanged.
 */
export const ROLES = ["Admin", "ProjectManager", "Contributor", "Viewer"] as const;

export type Role = (typeof ROLES)[number];

export interface Session {
  userId: number;
  username: string;
  role: Role;
}

export interface AuthProvider {
  /** Current session or null when not signed in. */
  getSession(): Promise<Session | null>;
  /** Current session; throws AppError("UNAUTHENTICATED") when absent. */
  requireSession(): Promise<Session>;
}

/**
 * Permission strings: "<module>:<verb>". Verbs: read | create | update |
 * delete, plus module-specific verbs registered in rbac.ts (e.g. todo:snooze).
 */
export type Permission = `${string}:${string}`;
