# ADR-0015 — Auth provider interface stubbed until module #4; contract final now

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

The action wrapper (ADR-0003), RBAC and audit need a session **now**; Auth.js
credentials + sessions arrive in module #4. The contract must be final so #4 swaps the
implementation without touching call sites.

## Decision

- `src/lib/auth/types.ts` defines the final contract:

  ```ts
  type Role = "Admin" | "ProjectManager" | "Contributor" | "Viewer";
  interface Session { userId: number; username: string; role: Role }
  interface AuthProvider {
    getSession(): Promise<Session | null>;
    requireSession(): Promise<Session>; // throws AppError UNAUTHENTICATED
  }
  ```

- Permissions are strings `<module>:<verb>` (`verb ∈ read|create|update|delete` plus
  module-specific verbs, e.g. `todo:snooze`). `src/lib/auth/rbac.ts` holds the single
  role→permission matrix (from PLAN.md §9); `can(role, permission)` is pure and
  unit-tested. Row-level checks live in procs (ADR-0012), not in the matrix.
- Until #4 merges, `src/lib/auth/provider.ts` exports a **dev stub**: session
  `{ userId: 1, username: "dev", role: "Admin" }` when `AUTH_DEV_BYPASS=1` (set only in
  dev/docker-compose), otherwise `null`. The stub file is the ONLY thing #4 replaces
  (with Auth.js `auth()`); it is tracked in issue #4 — this is a disclosed, tracked
  stub, not dead code.
- `ViewPreference` and audit take `userId` from the session; anonymous (pre-#4 prod)
  falls back to cookie-only preferences and `ActorUserId = NULL` audit rows are
  rejected for mutations (mutations REQUIRE a session even in stub mode).

## Consequences

Module sessions 5–24 code against the final auth surface from day one; #4 is a
drop-in replacement plus login UI and rate limiting.
