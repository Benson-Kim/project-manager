# Boards Tracking Matrix — plan part → slice → files → proof

Source of truth for *what* to build: the approved plan
`~/.claude/plans/help-me-create-a-structured-hanrahan.md` ("Kanban/Scrum boards + item colour in
WBS and Gantt"), written 2026-10-21. Decisions are recorded in
[ADR-0038](adr/ADR-0038-boards.md). Slice names (B1–B6) are the plan's own "Order of commits".
Session handoffs: `.agent-scratch/handoff-boards-module.md` (into the module) and
`.agent-scratch/handoff-boards-b1.md` (out of slice B1).

**Status vocabulary.** `Landed` = written, and everything that *can* run locally has run green.
`Partial` = some of the part landed; the row says what is missing. `Open` = not started.
`Blocked` = cannot be built on this branch's base; the row says why.

**Verification honesty.** This branch is based on `origin/develop`. There is no database, no `.env`,
no Docker and no server in this workspace, so **no migration, stored procedure, `db/tests/*.cjs`
script or Playwright spec has ever been executed, in any session**. Those rows are proven by CI
(`[db]`, `[e2e]`) after the user commits and pushes — never read `Landed` on a `db/**` or `e2e/**`
row as "it ran". What ran locally: `tsc --noEmit`, `vitest run --coverage`, `eslint`, `prettier`.

## Plan parts

| Part | What it covers | Slice | Status | Where | Proof |
|---|---|---|---|---|---|
| 1 | Item colour in WBS/Gantt: `Project.WbsColorBy`, `usp_KeyDeliverable_Set{Color,ColorBy}`, colour inheritance, toolbar switch | own PR | **Blocked** | — | Its template proc `usp_KeyDeliverable_SetStatus.sql` is absent on `develop`, and it amends ADR-0036, also absent (develop stops at ADR-0034). Needs `feature/wbs-requirements` merged first. |
| 2a | RBAC: `boards` in `CONTRIBUTOR_WRITE_MODULES` and `OVERRIDABLE_MODULES`, the proc's section list, the matrix label | B1 | **Landed** | `src/lib/auth/rbac.ts`, `db/procs/project-permission/usp_ProjectPermission_Set.sql`, `src/modules/projects/components/permission-matrix.ts`, `src/lib/messages.ts` | `proc-access-levels.test.ts` pins the proc's list equal to `OVERRIDABLE_MODULES` |
| 2b | Tolerant override parsing (an unknown section is ignored, not a ZodError) | B1 | **Landed** | `src/modules/projects/repository/{project-access,project-permissions}.ts` | ADR-0038 §11; `project-access.test.ts` |
| 2c | Access guardrail: `board` + `board-column` folders in MODULES | B1–B2 | **Partial** | `src/tests/proc-access-levels.test.ts` | `board-column` now scanned. `EXEMPT` (`usp_Board_AssertRoom`) and `CROSS_SCOPE` (`usp_Board_SetProject`) are still Open — B2 (cards) and B4. |
| 2d | Error code 50007 `LIMIT_REACHED` (HTTP 422) | B2 | **Landed** | `src/lib/errors.ts`, `src/lib/db.ts`, `src/lib/messages.ts`, `docs/adr/ADR-0012-proc-error-contract.md`, `docs/STANDARDS.md` | `src/lib/tests/errors.test.ts` maps 50007. No proc throws it yet — its throwers (column WIP, sprint `Start`) land with the card/sprint slices. |
| 2e | Shared pointer-drag primitives (`components/ui/drag/**`) | B2 | **Partial** | `src/components/ui/drag/pointer-drag.ts` | Pure `DRAG_SLOP`/`exceedsSlop`/`edgeScroll`/`insertionIndex` landed and unit-tested; `edgeScroll` mirrors the WBS copy for the later unification. The client hook `use-pointer-drag.ts` is deferred to land with the board view that consumes it. |
| 3 | Boards schema | B1 | **Partial** | `db/migrations/037_boards.sql` | `app.Board`, `BoardColumn`, `BoardPhase`, `BoardSprint` landed. **`app.BoardCard` deliberately absent**: its `RequirementId` references `app.Requirement` (migration 036), so the table and that FK land together in migration 038. Not executed here. |
| 4a | `board/` procs: access rule, guard, List, ListOptions, GetById, Create, Update, Delete | B1 | **Landed** | `db/procs/board/ufn_Board_AccessLevel.sql`, `db/procs/board/usp_Board_{AssertAccess,List,ListOptions,GetById,Create,Update,Delete}.sql` | `board-sql-guardrails.test.ts` (15), `proc-access-levels.test.ts`, `app-login.test.ts`. Not executed here. |
| 4b | `board-column/` Create, Update, Move | B2 | **Partial** | `db/procs/board-column/usp_BoardColumn_{Create,Update,Move}.sql` | `board-sql-guardrails.test.ts` (board-column block), `proc-access-levels.test.ts`, `board-columns.test.ts`; authz cases in `boards-procs.cjs`. **Column `Delete` deferred** — it reflows cards into a target column, and `app.BoardCard` is not on this base. Not executed here. |
| 4c | `board-phase/`, `board-sprint/`, `board-card/` procs; `AssertRoom`; `GetBoard`; `ListAssignees`; `SetProject`; `SortKey` ordering | B2–B4 | **Open** | — | `AssertRoom`, `GetBoard`, `ListAssignees` and all card/sprint/phase procs need `app.BoardCard` (migration 038, gated on the register) |
| 5 | Contracts and pure rules | B1–B2 | **Partial** | `src/modules/boards/schemas/{board,board-rules,board-column}.ts` | `boards.test.ts`, `board-columns.test.ts`. Column contracts landed; `board-form.ts` and the card/sprint contracts are Open. |
| 6 | Server layer: repository and actions | B1–B2 | **Partial** | `src/modules/boards/repository/{boards,board-columns}.ts`, `src/modules/boards/actions/index.ts` | `boards.test.ts`, `board-columns.test.ts`, `actions.test.ts` assert the **exact** `execProc` parameter set per call (the mass-assignment pin). Column **repository** landed; the column **server actions** are deferred to land with the board view that calls them and owns their revalidation routes. |
| 7a | Top-level nav item and route | B1 | **Landed** | `src/components/shell/{nav-items.ts,shell-icons.tsx}`, `src/app/(app)/boards/page.tsx` | `nav-items.test.ts`, `e2e/shell.spec.ts` (e2e not executed here). The page is an honest placeholder, per the convention stated in `nav-items.ts`. |
| 7b | Project section, sidebar create button, the four real routes | B2 | **Open** | — | Deliberately deferred: `project-sections.ts` states the section nav takes **no placeholders**, and a create button pointing at `?id=new` needs the board sheet. See "Deferred on purpose". |
| 8 | Board UI: board view, card, moves, card sheet, planning view, column editor, link dialog | B2–B4 | **Open** | — | The list must be a DataView (`docs/AGENTS.md` quality gate), so no hand-rolled list is acceptable |
| 9 | Requirements packaging and redaction | B5 | **Blocked** | — | Gated on ADR-0037 being on this base. `src/modules/requirements/` does not exist on `develop`, so `requirementRef` cannot be imported yet. |
| 10 | Docs | B1–B2 | **Partial** | `docs/adr/ADR-0038-boards.md`, `docs/adr/ADR-0012-proc-error-contract.md` (50007), `docs/adr/README.md`, `docs/MODULE-PROMPTS.md`, `db/README.md`, `db/tests/README.md`, `docs/STANDARDS.md` (50007), `docs/TRACEABILITY.md`, `LESSONS.md` §35–§36, this file | ADR-0039 (colour mode) and the ADR-0028 §8 `execProcSets` note are Open (both land with their slices) |

## Tests

| Suite | Scope | Status | Runs where |
|---|---|---|---|
| `src/modules/boards/tests/boards.test.ts` | board rules, contracts, exact `execProc` parameters per repository call | **Landed** (15) | locally |
| `src/modules/boards/tests/board-columns.test.ts` | column contracts (server-owned fields dropped), exact `execProc` parameters per column call, row-version coercion | **Landed** | locally |
| `src/modules/boards/tests/actions.test.ts` | each intention, revalidation, server-owned fields, unauthenticated | **Landed** (7) | locally |
| `src/components/ui/tests/pointer-drag.test.ts` | pure drag primitives: slop, edge-scroll cap, insertion index | **Landed** | locally |
| `src/lib/tests/errors.test.ts` | every registered THROW number → code, including 50007 | **Landed** | locally |
| `src/tests/board-sql-guardrails.test.ts` | CHECK lists vs TS enums, lock-before-assert, RowVer guard, audit in-transaction, project-from-row, deleted-project hiding, escape chain, static SQL, function folder, payload validation; **board-column block** (assert through the board, lock-first, RowVer, audit, static SQL) | **Landed** | locally |
| `src/tests/proc-access-levels.test.ts` | `board` + `board-column` folders registered; every proc's `@MinLevel`/`@Permission` vs `requiredLevel()` | **Landed** | locally |
| `db/tests/boards-procs.cjs` | authorization matrix, standalone shared space, overrides, stale RowVer, payload refusals, LIKE-metacharacter search, deleted project, **column create/update/move access + duplicate name + validation** | **Ran in CI 2026-10-23**: 46/50, then 50/50 after the outsider fix below | CI only |
| `db/tests/boards-race.cjs` | the plan's race matrix (WIP slots, sprint start/complete, renumber, link-while-packaging) | **Open** | CI only |
| `e2e/boards.spec.ts`, `e2e/boards-rbac.spec.ts` | the board views and the RBAC matrix | **Open** | CI only |

Local battery after merging develop (the register) into this branch: `tsc` 0 · **166 files, 8,065
tests, 0 failures** · 90.73 % statements, 91.63 % lines (gate 80 %) · `eslint` and `prettier --check`
clean on every changed file. Nothing in `db/**` runs here: no database — CI with `[db]` `[e2e]`
proves it.

**First CI `[db]` run, 2026-10-23** (branch pushed at `ff9d733`): migration 037 applied and every
board and board-column proc was created and exercised for the first time. 46 of 50 checks passed;
the four failures were **one test defect, not a product defect** — `boards-procs.cjs` used user 2
as "an outsider", but the e2e seed makes user 2 `e2e-admin`, a global Admin who is Manager
everywhere (ADR-0021), so the two access checks correctly allowed it; the write that should have
been refused then added a real column, which shifted the two `SortOrder` assertions that follow.
The test now creates its own unassigned user. Recorded as LESSONS §36.

## Invariants and where each is enforced

Mirrors the plan's invariant table; `Database` is the strongest layer and the one to prefer
(`engineering-standards` integrity.md).

| Invariant | Enforced by | Strength | Status |
|---|---|---|---|
| A sprint's phase, and a child's board, are its own board's | composite FKs on `UNIQUE (BoardId, <child>Id)` | Database | **Landed** (037) |
| At most one active sprint per board | `UQ_BoardSprint_Active` filtered unique index + a check under the board lock | Database + proc | **Partial** — index landed, the `Start` proc is B3 |
| A sprint's stamps match its state | `CK_BoardSprint_StateStamps` | Database | **Landed** (037) |
| Column category, WIP range, phase and sprint dates are valid | CHECKs + zod, compared by a guardrail | Database | **Landed** (037) |
| A column name is unique per live board | `UQ_BoardColumn_Name` filtered unique index | Database | **Landed** (037) |
| Access is resolved from the row, under the board lock | proc shape + guardrail by position | Proc + guardrail | **Landed** (B1) |
| Stale writes refused; every write audited in its transaction | `CAST(RowVer AS BIGINT) = @RowVer` → 50002; audit insert before COMMIT | Proc + guardrail | **Landed** (B1) |
| A board of a deleted project is unreachable | guard + both list procs filter `p.IsDeleted = 0` | Proc | **Landed** (B1) |
| A card has a title or a requirement; one requirement per board; one card order | CHECK + filtered unique indexes | Database | **Open** — migration 038 |
| No column takes a card past its WIP limit | `AssertRoom` under the board lock | Proc, race-tested | **Open** — B2 |
| Restricted cards carry no requirement data | read procs + db tests | Tested | **Open** — B5 |

## Deferred on purpose

- **The project section and the sidebar create button.** Both were built and then reverted, because
  two house rules decide it: `nav-items.ts` says a top-level item whose module has not landed points
  at an honest placeholder page, while `project-sections.ts` says the section nav takes **no
  placeholders**; and a create button pointing at `?id=new` with no sheet to open is a dead link.
  `sidebar-content.tsx`, `app-shell.tsx`, `(app)/layout.tsx`, `project-sections.ts` and
  `project-sections.test.ts` are byte-identical to `HEAD`. `messages.projects.boardsSection` stays,
  because the permission matrix needs a label for the new overridable section. Both land with Part 8.
- **`app.BoardCard` and migration 038** — see Part 3.
- **Part 1 (colour)** — see Part 1; blocked by the base, not by choice.
- **Column `Delete`** (B2). It reflows a column's cards into a target column before soft-deleting, so
  it reads and writes `app.BoardCard`, which is not on this base. It lands with the card slice; a proc
  referencing a table that does not exist yet could not be DB-tested and would fail at run time.
- **The column server actions** (B2). The board view that calls `createBoardColumn`/`updateBoardColumn`/
  `moveBoardColumn` is deferred (Part 8); it owns the routes those actions revalidate, so the thin
  action wrappers land with it. The mass-assignment property is already pinned at the repository layer,
  which is where `execProc` is actually called.
- **`use-pointer-drag.ts`** (B2). The React hook has no consumer until the board view, and an untested
  client hook would not be exercised by any test here. The pure primitives it would wrap have landed.
- **`ListAssignees`** (B2 in the plan's order). Its only consumers — card-assignee validation and the
  card sheet — are in the deferred card slice, so building it now would be unconsumed code.

## Not owned by this module

Two project-wide items stay open and are **not** to be closed here:

- **`NOT_FOUND` thrown before the access check.** The board procs do not reproduce the oracle for a
  missing, deleted or deleted-project board (one 50001 for all three), but an *existing* board in a
  project the actor cannot read still returns 50003, which distinguishes existence. Closing that
  collapses two ADR-0012 codes across every module's write procs; it needs its own ADR and branch.
  `db/tests/boards-procs.cjs` asserts today's behaviour with a comment saying it records rather than
  endorses it.
- **No `error.tsx` on any route segment.** A project-wide UX decision; the new `/boards` route
  inherits it. (`src/app/(app)/projects/[id]/loading.tsx` and `src/app/not-found.tsx` do exist, so
  the inherited note that there are none at all is overstated.)

## Numbering

ADR-0038 and migration 037 are taken by this module. Next free: **ADR-0039 / migration 038** — which
the colour-mode ADR and the cards migration should take. Re-run the two `LESSONS.md` §33 commands
before citing any number: the numbers above 0034 live on branches that can move, and
`origin/wip/client-feedback-draft` force-updated mid-session.

**Coverage check:** every one of the plan's ten parts, its invariant table, its race matrix, its
authorization matrix and its test list appears above with a status. Nothing in the plan is untracked.
