# ADR-0003 — Typed Server Action wrapper

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

Every mutation must be validated, authenticated, authorised and audited, and must never
leak an exception (stack trace, SQL error) to the client. Hand-writing that per action
guarantees drift.

## Decision

One factory, `action()` in `src/lib/action.ts`, wraps every Server Action:

1. **Validate** the input `FormData`/object against the module's zod schema →
   on failure return `{ ok: false, error: { code: "VALIDATION", fieldErrors } }`.
2. **Authenticate** via the `AuthProvider` interface (ADR-0015) → `UNAUTHENTICATED`.
3. **Authorise** the declared permission (`<module>:<verb>`) against the session's
   role → `FORBIDDEN`.
4. **Execute** the handler with `(input, ctx)` where `ctx = { session }`. Handlers call
   repositories, passing `ctx.session.userId` as `ActorUserId` — mutation procs write
   the audit row themselves (single source of truth for before/after, ADR-0011).
5. **Map errors**: `AppError` (proc error contract, ADR-0012) → structured code;
   anything else → generic `INTERNAL` with server-side log. Never throw to the client.
6. **Revalidate**: handler returns paths/tags; wrapper calls
   `revalidatePath`/`revalidateTag` on success.

Return type is always `ActionResult<T>`:

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ActionErrorCode; message: string;
      fieldErrors?: Record<string, string[]> } };
```

`redirect()` after success is allowed (thrown redirects pass through).

## Consequences

RBAC and audit cannot be forgotten — they are structural. Client components consume one
result shape via `useActionState`. Unit tests target the wrapper once and each module's
schema/handler separately.
