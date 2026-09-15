# ADR-0002 — Stored-procedure-only data access

Status: Accepted (pre-existing, formalised) · Date: 2026-09-15 · Session: foundation (#2)

## Context

The product decision (epic #1) is SQL Server 2022 with all data access through stored
procedures: a stable, auditable database API, least-privilege grants (EXECUTE only),
no injection surface, and DBA-reviewable query plans.

## Decision

- The ONLY database gateway is `src/lib/db.ts` (`execProc`, `execProcFull`,
  `execProcTx`, `withTransaction`). Repositories call procs with named, typed
  parameters and zod-parse every row set.
- No inline SQL anywhere in `src/` — no `.query()`, no `.batch()`, no SQL strings.
  Enforced twice: ESLint `no-restricted-syntax` and the guardrail test
  `src/test/no-inline-sql.test.ts` (scans all of `src/` for SQL verbs in literals).
- Procs are named `usp_<Entity>_<Verb>`, one file per proc under
  `db/procs/<entity>/`, always `CREATE OR ALTER`, applied by `scripts/db-apply.sh`.
- Migrations `db/migrations/NNN_description.sql` are applied exactly once, tracked in
  `app.SchemaMigrations`.
- The app connects with a dedicated login that has EXECUTE on the `app`/`auth`/`audit`
  proc surface and no table DML rights (enforced from module #3 onward; `sa` is
  dev-container only).

## Consequences

Every feature needs a proc + repository + schema; the module blueprint bakes this in.
Slightly more ceremony per feature, in exchange for a locked-down, reviewable data
surface and zero injection risk.
