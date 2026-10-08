/**
 * Final auth contract ). Module #4 replaces the provider
 * implementation (src/lib/auth/provider.ts) with Auth.js — this file and all
 * call sites stay unchanged.
 */

/**
 * Global roles (ADR-0021): Admin manages everything; every other account is a
 * User whose rights come from their access level in each project.
 */
export const ROLES = ["Admin", "User"] as const;

export type Role = (typeof ROLES)[number];

/**
 * Per-project access levels, lowest first (ADR-0021). Mirrors the ranks in
 * auth.AccessLevel, which every stored procedure compares against.
 */
export const ACCESS_LEVELS = ["Viewer", "Contributor", "Manager"] as const;

export type AccessLevel = (typeof ACCESS_LEVELS)[number];

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
