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
| 1 | Item colour in WBS/Gantt: `Project.WbsColorBy`, `usp_KeyDeliverable_Set{Color,ColorBy}`, colour inheritance, toolbar switch | own PR | **Open** (was Blocked) | — | **Unblocked 2026-10-23**: PR #35 merged to develop (`5b28f11`), which this branch has merged, so `usp_KeyDeliverable_SetStatus.sql`, ADR-0036 and ADR-0037 are all on this base. Not started. Takes **ADR-0039**, still reserved for it. |
| 2a | RBAC: `boards` in `CONTRIBUTOR_WRITE_MODULES` and `OVERRIDABLE_MODULES`, the proc's section list, the matrix label | B1 | **Landed** | `src/lib/auth/rbac.ts`, `db/procs/project-permission/usp_ProjectPermission_Set.sql`, `src/modules/projects/components/permission-matrix.ts`, `src/lib/messages.ts` | `proc-access-levels.test.ts` pins the proc's list equal to `OVERRIDABLE_MODULES` |
| 2b | Tolerant override parsing (an unknown section is ignored, not a ZodError) | B1 | **Landed** | `src/modules/projects/repository/{project-access,project-permissions}.ts` | ADR-0038 §11; `project-access.test.ts` |
| 2c | Access guardrail: `board` + `board-column` + `board-card` folders in MODULES | B1–B2 | **Partial** | `src/tests/proc-access-levels.test.ts` | All three folders now scanned, and `EXEMPT` carries both internal helpers (`usp_Board_AssertRoom`, `usp_BoardCard_AssertAssignee`) with their reasons. `CROSS_SCOPE` (`usp_Board_SetProject`) is still Open — B4. |
| 2d | Error code 50007 `LIMIT_REACHED` (HTTP 422) | B2 | **Landed** | `src/lib/errors.ts`, `src/lib/db.ts`, `src/lib/messages.ts`, `docs/adr/ADR-0012-proc-error-contract.md`, `docs/STANDARDS.md` | `src/lib/tests/errors.test.ts` maps 50007. **It now has a thrower**: `usp_Board_AssertRoom`, and a guardrail asserts it is the *only* one, so `usp_BoardSprint_Start` (B3) has to be added deliberately. |
| 2e | Shared pointer-drag primitives (`components/ui/drag/**`) | B2 | **Partial** | `src/components/ui/drag/pointer-drag.ts` | Pure `DRAG_SLOP`/`exceedsSlop`/`edgeScroll`/`insertionIndex` landed and unit-tested; `edgeScroll` mirrors the WBS copy for the later unification. The client hook `use-pointer-drag.ts` is deferred to land with the board view that consumes it. |
| 3 | Boards schema | B1–B2c | **Landed** | `db/migrations/037_boards.sql`, `db/migrations/038_board_cards.sql` | 037: `app.Board`, `BoardColumn`, `BoardPhase`, `BoardSprint`. **038: `app.BoardCard`** with its `RequirementId` FK to `app.Requirement`, composite FKs to its column and sprint, table-level `CK_BoardCard_Content`, and the two filtered unique indexes (one requirement per board, one total order). `board-sql-guardrails.test.ts` compares every CHECK list with its TS enum. Not executed here. |
| 4a | `board/` procs: access rule, guard, List, ListOptions, GetById, Create, Update, Delete | B1 | **Landed** | `db/procs/board/ufn_Board_AccessLevel.sql`, `db/procs/board/usp_Board_{AssertAccess,List,ListOptions,GetById,Create,Update,Delete}.sql` | `board-sql-guardrails.test.ts`, `proc-access-levels.test.ts`, `app-login.test.ts`. **Ran in CI 2026-10-23** (`57c1c40`, 50/50). |
| 4b | `board-column/` Create, Update, Move, Delete | B2–B2c | **Landed** | `db/procs/board-column/usp_BoardColumn_{Create,Update,Move,Delete}.sql` | `board-sql-guardrails.test.ts` (column block), `proc-access-levels.test.ts`, `board-columns.test.ts`; authz, reflow and last-column cases in `boards-procs.cjs`. `Delete` reflows its cards into a target column that must have room for all of them, and never takes a board's last column. Not executed here. |
| 4c | `board-card/` procs, `AssertRoom`, `CardsInScope`, `GetBoard`, `ListAssignees`; `SortKey` ordering | B2c | **Partial** | `db/procs/board/{ufn_Board_CardsInScope,usp_Board_AssertRoom,usp_Board_GetBoard,usp_Board_ListAssignees}.sql`, `db/procs/board-card/usp_BoardCard_{AssertAssignee,Create,GetById,Update,Move,Delete}.sql` | `board-sql-guardrails.test.ts` (card + schema + WIP blocks), `proc-access-levels.test.ts`, `board-cards.test.ts`, `boards-procs.cjs`, `boards-race.cjs`. **Still Open in this row:** `board-phase/` and `board-sprint/` procs (B3), `usp_Board_SetProject` (B4), `usp_BoardCard_Package` (B5). Not executed here. |
| 5 | Contracts and pure rules | B1–B2c | **Partial** | `src/modules/boards/schemas/{board,board-rules,board-column,board-card,board-view}.ts` | `boards.test.ts`, `board-columns.test.ts`, `board-cards.test.ts`. Card contracts, the five-set read model, `wipState`, `cardLabel`, `SORT_KEY_GAP` and `REQUIREMENT_STATES` landed; `board-form.ts` and the sprint/phase contracts are Open. |
| 6 | Server layer: repository and actions | B1–B2c | **Partial** | `src/modules/boards/repository/{boards,board-columns,board-cards}.ts`, `src/modules/boards/actions/index.ts` | `boards.test.ts`, `board-columns.test.ts`, `board-cards.test.ts`, `actions.test.ts` assert the **exact** `execProc` parameter set per call (the mass-assignment pin). Card and column **repository** landed, `getBoard` reads all five sets through `execProcSets`; the card and column **server actions** are still deferred to land with the board view that calls them and owns their revalidation routes. |
| 7a | Top-level nav item and route | B1 | **Landed** | `src/components/shell/{nav-items.ts,shell-icons.tsx}`, `src/app/(app)/boards/page.tsx` | `nav-items.test.ts`, `e2e/shell.spec.ts` (e2e not executed here). The page is an honest placeholder, per the convention stated in `nav-items.ts`. |
| 7b | Project section, sidebar create button, the four real routes | B2 | **Open** | — | Deliberately deferred: `project-sections.ts` states the section nav takes **no placeholders**, and a create button pointing at `?id=new` needs the board sheet. See "Deferred on purpose". |
| 8 | Board UI: board view, card, moves, card sheet, planning view, column editor, link dialog | B2–B4 | **Open** | — | The list must be a DataView (`docs/AGENTS.md` quality gate), so no hand-rolled list is acceptable |
| 9 | Requirements packaging and redaction | B5 | **Partial** (was Blocked) | `db/procs/board/usp_Board_GetBoard.sql`, `db/procs/board-card/usp_BoardCard_GetById.sql` | **Unblocked**: the register is on this base, so `app.Requirement` and `requirementRef` are importable. **Redaction landed early, with the read procs**: both report `RequirementState` none/live/restricted/removed, NULL every requirement column for a restricted card, and refuse to match restricted text in a search — leaving a read that leaks once packaging lands was not an acceptable gap. **`usp_BoardCard_Package` and the register's "Add to board…" are still Open.** Redaction is therefore *written but not yet exercisable*: with no Package proc, no card can carry a requirement, so `boards-procs.cjs` cannot build the restricted case. Those db tests land with Package. |
| 10 | Docs | B1–B2 | **Partial** | `docs/adr/ADR-0038-boards.md`, `docs/adr/ADR-0012-proc-error-contract.md` (50007), `docs/adr/README.md`, `docs/MODULE-PROMPTS.md`, `db/README.md`, `db/tests/README.md`, `docs/STANDARDS.md` (50007), `docs/TRACEABILITY.md`, `LESSONS.md` §35–§36, this file | ADR-0039 (colour mode) and the ADR-0028 §8 `execProcSets` note are Open (both land with their slices) |

## Tests

| Suite | Scope | Status | Runs where |
|---|---|---|---|
| `src/modules/boards/tests/boards.test.ts` | board rules, contracts, exact `execProc` parameters per repository call | **Landed** (15) | locally |
| `src/modules/boards/tests/board-columns.test.ts` | column contracts (server-owned fields dropped), exact `execProc` parameters per column call, row-version coercion | **Landed** | locally |
| `src/modules/boards/tests/actions.test.ts` | each intention, revalidation, server-owned fields, unauthenticated | **Landed** (7) | locally |
| `src/components/ui/tests/pointer-drag.test.ts` | pure drag primitives: slop, edge-scroll cap, insertion index | **Landed** | locally |
| `src/lib/tests/errors.test.ts` | every registered THROW number → code, including 50007 | **Landed** | locally |
| `src/modules/boards/tests/board-cards.test.ts` | card contracts (an edit owns no column, sprint, board, requirement or rank), exact `execProc` parameters per card call, the five-set read's parameters and parsing, `wipState`, `cardLabel` not leaking a restricted card | **Landed** (18) | locally |
| `src/tests/board-sql-guardrails.test.ts` | CHECK lists vs TS enums, lock-before-assert, RowVer guard, audit in-transaction, project-from-row, deleted-project hiding, escape chain, static SQL, function folder, payload validation; **board-column block**; **card schema block** (palette, points, composite FKs, table-level content CHECK, both filtered uniques); **card proc block** (WIP checked on exactly Create and Move, the moving card excluded, an edit takes no column/sprint/board/requirement/rank, one-statement renumber, `restricted` before `removed`, search gated on access); **WIP-rule block** (one definition, one thrower of 50007, helpers refuse outside a transaction, no TS file names them) | **Landed** (47) | locally |
| `src/tests/proc-access-levels.test.ts` | `board` + `board-column` + `board-card` folders registered; both internal helpers `EXEMPT` with reasons; every proc's `@MinLevel`/`@Permission` vs `requiredLevel()` | **Landed** (439) | locally |
| `src/tests/migration-foreign-key-targets.test.ts` | project-wide, new here: every `REFERENCES` target across `db/migrations/**` is a table some migration creates. Written after `app.[User]` (there is no such table — user FKs are `auth.[User]`) reached migration 038 and passed every local gate, because nothing else reads a migration's object names. Proven by reintroducing the defect and watching it fail | **Landed** (51) | locally |
| `db/tests/boards-procs.cjs` | authorization matrix, standalone shared space, overrides, stale RowVer, payload refusals, LIKE-metacharacter search, deleted project, column create/update/move; **cards** (foreign column/neighbour refused, assignee rule, WIP limit, an edit that moves nothing, the five-set read and its counts, the assignee picker, column delete reflow, last-column refusal) | 50/50 **ran in CI 2026-10-23** at `57c1c40`; the card half is **written, not yet run** | CI only |
| `db/tests/boards-race.cjs` | **Partial**: 20 creates into a limit of 5 leave exactly 5; 20 moves into the last free slot leave exactly 1 winner; an unlimited column takes everything; a forced renumber never surfaces as INTERNAL and never leaves two cards sharing a rank; an edit racing a move gives one winner and one CONFLICT; no live card left in a deleted column or on a deleted board. **Open rows** (sprint start/complete, sprint/phase deletes, packaging, link-while-packaging) need B3–B5 procs and are listed in the file's header | **Written, never run** | CI only |
| `e2e/boards.spec.ts`, `e2e/boards-rbac.spec.ts` | the board views and the RBAC matrix | **Open** | CI only |

Local battery after the card slice: `tsc` 0 · **168 files, 8,236 tests, 0 failures** · 90.74 %
statements, 91.62 % lines (gate 80 %) · `eslint` clean and `prettier --check` clean on every changed
file. Nothing in `db/**` runs here: no database — CI with `[db]` proves it. `boards-race.cjs` was
added to `.github/workflows/ci.yml` so it runs there.

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
| A card has a title or a requirement; one requirement per board; one card order | table-level `CK_BoardCard_Content` + `UQ_BoardCard_Requirement` + `UQ_BoardCard_SortKey` | Database | **Landed** (038) |
| A card's column and sprint are its own board's | composite FKs `(BoardId, BoardColumnId)` and `(BoardId, BoardSprintId)` | Database | **Landed** (038) |
| Card points and colour are valid | `CK_BoardCard_StoryPoints`, `CK_BoardCard_Color`, compared with the TS enums by a guardrail | Database | **Landed** (038) |
| No column takes a card past its WIP limit | `usp_Board_AssertRoom` under the board lock, counting through `ufn_Board_CardsInScope` | Proc, race-tested | **Landed** (B2c) — `boards-race.cjs` written, runs in CI |
| A board keeps at least one column | proc check in `usp_BoardColumn_Delete` | Proc | **Landed** (B2c) |
| No live card sits in a deleted column | reflow under the board lock, before the column goes | Proc, race-tested | **Landed** (B2c) |
| A card may only be assigned to someone who can reach the board | `usp_BoardCard_AssertAssignee`, which `usp_Board_ListAssignees` mirrors | Proc | **Landed** (B2c) — point-in-time, by design |
| A project board holds only its own project's requirements | `Package`/`SetProject` under the board lock | Proc | **Open** — B4/B5. Deliberately **not** a composite FK: see ADR-0038 Consequences |
| Restricted cards carry no requirement data | read procs + db tests | Proc | **Partial** — both read procs redact, and `restricted` is decided before `removed`; the db test needs `Package` (B5) before a card can carry a requirement at all |

## Deferred on purpose

- **The project section and the sidebar create button.** Both were built and then reverted, because
  two house rules decide it: `nav-items.ts` says a top-level item whose module has not landed points
  at an honest placeholder page, while `project-sections.ts` says the section nav takes **no
  placeholders**; and a create button pointing at `?id=new` with no sheet to open is a dead link.
  `sidebar-content.tsx`, `app-shell.tsx`, `(app)/layout.tsx`, `project-sections.ts` and
  `project-sections.test.ts` are byte-identical to `HEAD`. `messages.projects.boardsSection` stays,
  because the permission matrix needs a label for the new overridable section. Both land with Part 8.
- **Part 1 (colour)** — see Part 1. No longer blocked; simply not started, and it is its own PR.
- **The card and column server actions** (B2/B2c). The board view that calls them is deferred
  (Part 8); it owns the routes those actions revalidate, so the thin action wrappers land with it.
  The mass-assignment property is already pinned at the repository layer, which is where `execProc`
  is actually called, and `board-cards.test.ts` asserts the exact parameter set of every card call.
- **`use-pointer-drag.ts`** (B2). The React hook has no consumer until the board view, and an untested
  client hook would not be exercised by any test here. The pure primitives it would wrap have landed.
- **Resolved since B2** — these were deferred for a missing base and are now built:
  `app.BoardCard` and migration 038, column `Delete`, `AssertRoom`, `GetBoard`, `ListAssignees`,
  the card procs and `boards-race.cjs`.

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

**Settled 2026-10-23 with the `feature/wbs-requirements` session**, which had independently created
a second ADR-0038:

| Number | Holder | Where |
|---|---|---|
| 0035 | notes module | `feature/notes` |
| 0036, 0037 | WBS requirements, the register | develop (PR #35) |
| **0038** | **boards — this module** | `feature/boards` |
| 0039 | **reserved**: WBS/Gantt colour mode (Part 1) | unwritten |
| 0040 | the `NOT_FOUND`-before-access oracle | `feature/wbs-requirements` |

The oracle ADR renumbered, not this one: ADR-0038 was already pushed and cited in `STANDARDS.md`,
`ADR-0012`, `adr/README.md`, `TRACEABILITY.md`, `LESSONS.md` §35–36 and the header comment of every
file in `db/procs/board*/` plus migration 037, while the other was untracked. It took 0040 rather
than 0039 because 0039 is itself already named in this file and in the plan. A gap at 0039 is
normal here — 0035 is on another branch and absent from both indexes.

Migrations: **037 and 038** are taken by this module. Next free: **ADR-0041 / migration 039**.
Re-run the two `LESSONS.md` §33 commands before citing any number: the numbers above 0034 live on
branches that can move, and `origin/wip/client-feedback-draft` force-updated during slice B1.

**Coverage check:** every one of the plan's ten parts, its invariant table, its race matrix, its
authorization matrix and its test list appears above with a status. Nothing in the plan is untracked.
