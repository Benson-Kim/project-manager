# ADR-0031 — The request gate: internal routes and throttling

Status: Accepted · Date: 2026-10-16 · Session: whole-codebase review (the-fool + security challenge)
Amends ADR-0017 (login protection) and the STANDARDS §4 rate-limiting paragraph.

## Context

The review found four gaps in how requests reach the app:

- `POST /api/internal/todo-alerts/dispatch` is called by a scheduler with a bearer token and no
  session cookie. The proxy (`src/proxy.ts`) treated it like any page: no session, redirect to
  `/login`. Web Push could never dispatch on the server edition; the 60 s foreground poll hid it.
- STANDARDS §4 promised "mutations 60/min/session — fixed-window counters in SQL". Nothing
  implemented it. Server Actions, the CSV and PDF exports could be called without limit.
- The login limiter keys on the client IP. With `TRUSTED_PROXY_COUNT=0` (direct, Docker Compose,
  desktop) every client is "unknown", so the whole office shared one bucket of 5 attempts a
  minute: one person's wrong password locked everyone out for a minute.
- `authorize()` ran argon2id only for known usernames. The message is generic, but the response
  time told a valid username from an unknown one.

## Decision

1. **Internal routes are outside the session gate.** The proxy matcher excludes `/api/internal`
   (as it excludes `/api/files`). Every route there authenticates its own bearer token with a
   timing-safe compare and answers 503 when its feature is not configured. The guardrail
   `src/tests/proxy-matcher.test.ts` pins the exclusion; `e2e/security-headers.spec.ts` posts
   without a cookie and expects 401 or 503, never a redirect.
2. **Throttling is an in-process fixed window per user** (`src/lib/rate-limit.ts`), not SQL.
   The app runs as one process per deployment (one container, one desktop), so a process-local
   counter is exact and costs nothing; it resets on restart, which is acceptable for abuse
   control. Limits, per minute, per user id, from the environment with these defaults:
   - `RATE_LIMIT_ACTIONS_PER_MINUTE` = 240: every Server Action, checked in `action()` after
     authentication, before the handler. Over the limit the action returns
     `{ ok: false, error: { code: "RATE_LIMITED" } }` with a message from `messages.errors`.
   - `RATE_LIMIT_EXPORTS_PER_MINUTE` = 20: the CSV and PDF route handlers answer 429 with
     `Retry-After`.
   - `0` turns a limit off (the unit suite runs with actions off, and tests the limiter itself).
   Uploads keep their own controls (size cap, quota, free-space floor; ADR-0026 §6).
3. **Login limiting keys on the user first.** The per-user lockout (5 failures, exponential
   backoff) stays the primary control. The IP window is 5/min for a known client IP; when the IP
   is unknown the window is a shared 60/min, which still stops scripted guessing without
   locking an office out. `TRUSTED_PROXY_COUNT=1` is required behind a reverse proxy.
4. **Unknown usernames cost the same as known ones.** `authorize()` verifies the password
   against a fixed dummy argon2id hash when the user does not exist, so timing no longer
   enumerates accounts.

## Consequences

- Push dispatch works on the server edition; the scheduler's token is the only credential the
  route accepts. New internal routes must follow the same pattern and are listed here.
- A script that drives the UI faster than 4 actions a second, or exports more than 20 times a
  minute, is refused with a clear message; people never reach these limits.
- The limiter is per process: a multi-instance deployment would need a shared store, which the
  single-instance assumption (ADR-0032) rules out for now.
- STANDARDS §4 is corrected to describe what runs.
