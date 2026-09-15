# ADR-0012 — Stored-procedure error-code contract

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

Procs must signal business failures (not found, conflict, duplicate) in a way the
repository can map to typed errors without string matching on localisable text, and
without leaking SQL details to clients.

## Decision

- Business failures use `THROW <number>, '<CODE>:<human message>', 1` with this fixed
  number/code registry:

  | Number | Code | Meaning / HTTP analogue |
  |---|---|---|
  | 50001 | `NOT_FOUND` | row absent or soft-deleted (404) |
  | 50002 | `CONFLICT` | rowversion mismatch (409) |
  | 50003 | `FORBIDDEN_ROW` | row-level access denied (403) |
  | 50004 | `VALIDATION` | business-rule violation (422) |
  | 50005 | `DUPLICATE` | unique violation surfaced deliberately (409) |

  Numbers 50006+ may be registered here by later ADR/STANDARDS updates only.
- `src/lib/db.ts` maps mssql `RequestError` with number 50001–50999 to
  `AppError { code, message }`; any other DB error becomes `AppError { code:
  "INTERNAL" }` with the original logged server-side only.
- The `action()` wrapper (ADR-0003) forwards `AppError.code` into `ActionResult.error`
  and maps `INTERNAL` to a generic message from `messages.ts`.
- Row-level authorisation: procs that operate on project-scoped data take
  `@ActorUserId` and verify access (from module #4 onward, via role/assignment
  checks), throwing `FORBIDDEN_ROW` — defence in depth beneath the action-layer RBAC.

## Consequences

Typed, testable error handling end-to-end; SQL details never reach a client; procs are
self-defending even if a future caller bypasses the action layer.
