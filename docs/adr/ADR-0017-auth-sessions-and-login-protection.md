# ADR-0017 — Auth.js JWT sessions with a SessionVersion revocation stamp

Status: Accepted · Date: 2026-09-15 · Session: auth-and-rbac (#4)

## Context

Module #4 replaces the ADR-0015 dev-stub provider with real authentication.
STANDARDS §4 mandates Auth.js v5, credentials + argon2id, 8 h idle expiry and
server-side revocation. The open structural choices: JWT vs database sessions,
how revocation works without a session table, and where login protection
(rate limit / lockout) lives.

## Decision

- **JWT session strategy, no `auth.Session` table.** Single-instance internal
  tool; DB sessions would add a table, three procs and a write per request for
  no benefit. Auth.js encrypts the JWT with `AUTH_SECRET` (≥ 32 random bytes,
  env-only), `maxAge` 8 h.
- **Revocation = `auth.User.SessionVersion` stamp.** Tokens carry the value
  they were minted with; `src/lib/auth/provider.ts` re-reads the current value
  on EVERY request (one indexed PK lookup) and treats a mismatch — or
  `IsActive = 0` — as signed out. Password change, role change, deactivation
  and `usp_User_BumpSessionVersion` all bump it, so admin-forced logout is
  immediate, which closes the classic JWT-revocation gap.
- **Login protection in SQL, not app memory** (survives restarts, matches the
  fixed-window mandate): `auth.LoginAttempt` per-IP counters via
  `usp_LoginAttempt_Record` (5/min/IP, atomic upsert + self-purge) plus
  per-user lockout counters on `auth.User` via `usp_User_RecordLoginAttempt`
  (from the 5th consecutive failure: 30 s · 2^n backoff capped at 30 min).
  Login/LoginFailed audit rows are written in-proc; unknown-username failures
  audit through `usp_Audit_Insert` with no EntityId.
- **argon2id via the `argon2` npm package** (m=19456 KiB, t=2, p=1). Native
  module with prebuilt linux-x64/glibc binaries — works on the `node:22` CI
  image and the production image without a compiler; fallback documented in
  ADR-0014 (`@node-rs/argon2`), switching requires updating both ADRs.
- **Seed-time hashing, nothing committed:** `scripts/db-apply.sh` hashes
  `SEED_ADMIN_PASSWORD` (env) with `scripts/hash-password.mjs` and passes the
  hash as a sqlcmd scripting variable; CI's `db:apply` uses a job-scoped
  throwaway value (same pattern as the ephemeral SA password). The seeded
  admin has `MustChangePassword = 1`, enforced by the proxy gate (the flag
  travels in the JWT, keeping the gate edge-safe).
- **Auth.js route handler** (`/api/auth/[...nextauth]`) is the sanctioned
  Route Handler exception to the server-actions-only rule; its CSRF protection
  is Auth.js built-in, and Server Actions keep Next's origin checks.

## Consequences

Every request costs one PK lookup (the price of real revocation — accepted).
The generic login failure message is preserved end-to-end: authorize() returns
null for unknown user, wrong password, locked and inactive alike, and
`usp_User_GetByUsername` returning an empty set (not a THROW) keeps that free
of exception control flow. No session table also means no session cleanup job.
