# ADR-0013 — Testing standard

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

Agents build modules unattended; tests are the contract that keeps them honest. The
workspace cannot reach npm, so CI is the only executor — tests must be deterministic
and fast.

## Decision

- **Vitest (node environment)** for logic: zod schemas (valid/invalid/coercion),
  action-wrapper behaviour, repositories with `vi.mock("mssql")`/mocked `execProc`,
  URL-state helpers, guardrail tests. No jsdom component tests — component behaviour is
  covered by Playwright where a real browser exists.
- **Guardrail tests** (always green, never weakened): `no-inline-sql.test.ts`
  (proc-only), plus foundation guardrails for messages tone (no `!`, no
  Title Case labels) and for the forbidden-list (no `any` via lint, no direct
  `mssql` import outside `src/lib/db.ts`).
- **Playwright per module** (minimum): happy path (create → appears in list), one
  validation failure (inline error shown, focus managed), one RBAC denial (Viewer role
  blocked once auth lands), and an axe scan (`@axe-core/playwright`) of the module's
  list + form with zero serious/critical violations.
- **Coverage**: Vitest `--coverage` thresholds 80 % lines/functions on
  `src/modules/**` and `src/lib/**`. Shared UI is exercised by the kitchen-sink e2e.
- **Seeds** are the fixture strategy: e2e runs against a DB seeded by
  `scripts/db-apply.sh` (deterministic Access-migrated data); tests never create their
  own schema. Data created by tests is namespaced (`e2e-` prefix) for cleanup.
- A failing test is fixed by fixing code. Deleting/loosening assertions to pass is
  forbidden and reverts the MR.

## Consequences

CI stays the source of truth; each module adds ~4 focused e2e specs and unit tests for
its schemas/repository; the kitchen sink covers shared primitives once.
