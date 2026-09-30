## What

<!-- One paragraph: the module, its entities, and what a user can now do. -->

Closes #<!-- issue iid -->

## How it complies

- Standards read: `docs/STANDARDS.md`, `docs/MODULE-BLUEPRINT.md`, issue's Standards compliance section
- Procs: <!-- list usp_* delivered -->
- List UI: DataView grid + list <!-- or n/a + why -->
- Detail/edit pattern: <!-- Sheet | decided full route -->
- New ADRs: <!-- links or "none" -->
- New dependencies: <!-- none, or dep + ADR link -->

## Verification

- [ ] Pipeline green: lint · typecheck · test · build
- [ ] e2e green (final commit contains `[e2e]`)
- [ ] Coverage ≥ 80 % on `src/modules/**` + `src/lib/**`
- [ ] axe scan: 0 serious/critical
- [ ] Verified locally / via CI only (workspace proxy) — state which:

## Definition of Done (STANDARDS.md §12)

- [ ] Migrations idempotent, tracked in `app.SchemaMigrations`; audit cols + RowVer + soft delete
- [ ] Procs `CREATE OR ALTER`, audit in-transaction, THROW error contract, List per ADR-0016
- [ ] Seeds from `docs/source/analysis/access-database.md` §4 only
- [ ] Repository `execProc`-only with zod row parsing
- [ ] All mutations via `action()` wrapper (permission + revalidate)
- [ ] Copy in `src/lib/messages.ts`; no hints/tooltips/helper text
- [ ] Tests: Vitest (schemas/repository/actions) + Playwright (happy, validation, RBAC, axe)
- [ ] `docs/TRACEABILITY.md` updated; issue acceptance criteria ticked

/label ~"status::review"
