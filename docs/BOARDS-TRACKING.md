# Boards Tracking Matrix — plan part → slice → files → proof

## UI delivery — 2026-10-28

The implementation on `feature/boards-ui` supersedes the historical deferred-UI status below.

Implemented: cross-project DataView catalogue and board creation; project board lists and navigation; Kanban columns and card details with rich notes, assignees, dates, points and colour; desktop drag/drop and explicit column/sprint moves and ordering controls; WIP counts/limits and column creation, editing, ordering and deletion with reflow; board editing/deletion and project link/unlink with explicit foreign-card removal; planning lanes, phase management and sprint creation/edit/start/complete/delete; atomic requirement packaging from the register (including selected rows) or board; hierarchical requirement references and links with existing restricted/removed redaction preserved. Polling pauses while a dialog is open.

Validation follows the user's explicit request: no tests added or run for this UI delivery. CI skips unit/database/E2E jobs only for `feature/boards-ui` and its PR; main/develop keep their existing checks. Lint, TypeScript and production compilation remain enabled. Final functional acceptance is manual and is not claimed complete. WBS/Gantt colour-by work remains its separately scoped feature, outside Kanban delivery.

Manual acceptance: create standalone/project boards; add/edit/delete and reorder cards; drag between columns and use move selectors on mobile; verify a WIP refusal; manage columns and confirm reflow; create phases/sprints, start a sprint, move backlog cards, complete into another sprint/backlog; package selected requirements and repeat to verify no duplicates; open requirement links; verify Viewer/Contributor/Manager permissions; edit in two sessions to observe a stale-version refusal; link/unlink projects and check foreign-card confirmation. Test completed and restricted/removed requirement states with appropriate accounts.

The earlier matrix below is retained as implementation history rather than a current claim that UI is absent.

Source of truth for *what* to build: the approved plan
`~/.claude/plans/help-me-create-a-structured-hanrahan.md` ("Kanban/Scrum boards + item colour in
WBS and Gantt"), written 2026-10-21. Decisions are recorded in
[ADR-0038](adr/ADR-0038-boards.md). Slice names (B1–B6) are the plan's own "Order of commits".
Session handoffs: `.agent-scratch/handoff-boards-module.md` (into the module) and
`.agent-scratch/handoff-boards-b1.md` (out of slice B1).

**Status vocabulary.** `Landed` = written, and everything that *can* run locally has run green.
`Partial` = some of the part landed; the row says what is missing. `Open` = not started.
`Blocked` = cannot be built on this branch's base; the row says why.

**Verification honesty.** There is no database, no `.env`, no Docker and no server in this
workspace, so **nothing in `db/**` or `e2e/**` has ever been executed locally, in any session**.
What runs locally is `tsc --noEmit`, `vitest run --coverage`, `eslint`, `prettier` and
`node --check`. Everything else is proven only by CI, after the user commits and pushes.

**As of run `39937547186` (2026-10-23, `e7b9ec0`), the `db/**` rows are proven.** That run was
green: migrations 037 and 038 applied, all nineteen board procs were created, and both behaviour
suites completed — `boards-procs.cjs` **138 passed, 0 failed** and `boards-race.cjs` **13 passed,
0 failed**, the latter executing for the first time in the module's history. Rows below that cite
those suites may now be read as having run.

**The `e2e/**` rows are still unproven.** The Playwright job runs only on `main`/`develop` or when
the head commit message carries `[e2e]` (`ci.yml:196`), and this module has never tagged a commit
that way because its UI (Part 8) is not built. No board spec has ever executed.

## Plan parts

| Part | What it covers | Slice | Status | Where | Proof |
|---|---|---|---|---|---|
| 1 | Item colour in WBS/Gantt: `Project.WbsColorBy`, `usp_KeyDeliverable_Set{Color,ColorBy}`, colour inheritance, toolbar switch | own PR | **Open** (was Blocked) | — | **Unblocked 2026-10-23**: PR #35 merged to develop (`5b28f11`), which this branch has merged, so `usp_KeyDeliverable_SetStatus.sql`, ADR-0036 and ADR-0037 are all on this base. Not started. Takes **ADR-0039**, still reserved for it. |
| 2a | RBAC: `boards` in `CONTRIBUTOR_WRITE_MODULES` and `OVERRIDABLE_MODULES`, the proc's section list, the matrix label | B1 | **Landed** | `src/lib/auth/rbac.ts`, `db/procs/project-permission/usp_ProjectPermission_Set.sql`, `src/modules/projects/components/permission-matrix.ts`, `src/lib/messages.ts` | `proc-access-levels.test.ts` pins the proc's list equal to `OVERRIDABLE_MODULES` |
| 2b | Tolerant override parsing (an unknown section is ignored, not a ZodError) | B1 | **Landed** | `src/modules/projects/repository/{project-access,project-permissions}.ts` | ADR-0038 §11; `project-access.test.ts` |
| 2c | Access guardrail: `board` + `board-column` + `board-card` folders in MODULES | B1–B4 | **Landed** | `src/tests/proc-access-levels.test.ts` | All five folders now scanned (`board-phase` and `board-sprint` added in B3), and `EXEMPT` carries both internal helpers (`usp_Board_AssertRoom`, `usp_BoardCard_AssertAssignee`) with their reasons. **`CROSS_SCOPE` landed in B4** with `usp_Board_SetProject`: it asserts both calls, their order, and that each level still equals `requiredLevel()` for its permission, and a second assertion fails the build if any *other* proc starts asking two different levels without being registered — so the generic one-level rule can never pass by reading only the first call it finds. Proven by weakening the proc's board-side check and watching both fail. |
| 2d | Error code 50007 `LIMIT_REACHED` (HTTP 422) | B2 | **Landed** | `src/lib/errors.ts`, `src/lib/db.ts`, `src/lib/messages.ts`, `docs/adr/ADR-0012-proc-error-contract.md`, `docs/STANDARDS.md` | `src/lib/tests/errors.test.ts` maps 50007. **It now has both its throwers**: `usp_Board_AssertRoom` (a full column) and `usp_BoardSprint_Start` (a sprint already running). The guardrail that asserted a single thrower is what forced the second to be argued for; it now lists both, and ADR-0038 decision 19 records the case. A third would need the same. |
| 2e | Shared pointer-drag primitives (`components/ui/drag/**`) | B2 | **Partial** | `src/components/ui/drag/pointer-drag.ts` | Pure `DRAG_SLOP`/`exceedsSlop`/`edgeScroll`/`insertionIndex` landed and unit-tested; `edgeScroll` mirrors the WBS copy for the later unification. The client hook `use-pointer-drag.ts` is deferred to land with the board view that consumes it. |
| 3 | Boards schema | B1–B2c | **Landed** | `db/migrations/037_boards.sql`, `db/migrations/038_board_cards.sql` | 037: `app.Board`, `BoardColumn`, `BoardPhase`, `BoardSprint`. **038: `app.BoardCard`** with its `RequirementId` FK to `app.Requirement`, composite FKs to its column and sprint, table-level `CK_BoardCard_Content`, and the two filtered unique indexes (one requirement per board, one total order). `board-sql-guardrails.test.ts` compares every CHECK list with its TS enum. Both migrations **applied in CI 2026-10-23** (run `39937547186`). |
| 4a | `board/` procs: access rule, guard, List, ListOptions, GetById, Create, Update, Delete | B1 | **Landed** | `db/procs/board/ufn_Board_AccessLevel.sql`, `db/procs/board/usp_Board_{AssertAccess,List,ListOptions,GetById,Create,Update,Delete}.sql` | `board-sql-guardrails.test.ts`, `proc-access-levels.test.ts`, `app-login.test.ts`. **Ran in CI 2026-10-23** (`57c1c40`, 50/50). |
| 4b | `board-column/` Create, Update, Move, Delete | B2–B2c | **Landed** | `db/procs/board-column/usp_BoardColumn_{Create,Update,Move,Delete}.sql` | `board-sql-guardrails.test.ts` (column block), `proc-access-levels.test.ts`, `board-columns.test.ts`; authz, reflow and last-column cases in `boards-procs.cjs`. `Delete` reflows its cards into a target column that must have room for all of them, and never takes a board's last column. **Ran green in CI 2026-10-23** (run `39937547186`). |
| 4c | `board-card/` procs, `AssertRoom`, `CardsInScope`, `GetBoard`, `ListAssignees`; `SortKey` ordering | B2c | **Partial** | `db/procs/board/{ufn_Board_CardsInScope,usp_Board_AssertRoom,usp_Board_GetBoard,usp_Board_ListAssignees}.sql`, `db/procs/board-card/usp_BoardCard_{AssertAssignee,Create,GetById,Update,Move,Delete}.sql` | `board-sql-guardrails.test.ts` (card + schema + WIP blocks), `proc-access-levels.test.ts`, `board-cards.test.ts`, `boards-procs.cjs`, `boards-race.cjs`. **Still Open in this row:** `usp_BoardCard_Package` (B5) — `usp_Board_SetProject` **landed in B4**, row 4e. `board-phase/` and `board-sprint/` landed in B3, below. **Ran green in CI 2026-10-23** (run `39937547186`). |
| 4e | `board/` `SetProject`: the cross-scope link, unlink and move | B4 | **Partial** | `db/procs/board/usp_Board_SetProject.sql` | `board-sql-guardrails.test.ts` ("board project linking guardrails", 7), `proc-access-levels.test.ts` (`CROSS_SCOPE`), `boards.test.ts` (the contract and the exact parameter set), `boards-procs.cjs` (both halves of the access pair isolated, stale RowVer, missing id, link/move/unlink), `boards-race.cjs` (link racing an outsider's moves). No migration: only `app.Board.ProjectId` changes. **Partial, and this is the one gap in B4:** the `@RemoveForeignCards` branch is unexercised by any db test, because `usp_BoardCard_Create` takes no `@RequirementId` and so no card can carry a requirement until `usp_BoardCard_Package` (B5) — the state that branch exists for cannot be built yet. Until then it is held by the guardrails alone. **Written here, not yet run in CI.** |
| 4d | `board-phase/` Create, Update, Move, Delete; `board-sprint/` Create, Update, Start, Complete, Delete | B3 | **Landed** | `db/procs/board-phase/usp_BoardPhase_{Create,Update,Move,Delete}.sql`, `db/procs/board-sprint/usp_BoardSprint_{Create,Update,Start,Complete,Delete}.sql` | `board-sql-guardrails.test.ts` (phase block, sprint block), `proc-access-levels.test.ts` (both folders registered; `Start`/`Complete` mapped to the update verb), `board-phases.test.ts`, `board-sprints.test.ts`, `boards-procs.cjs`, `boards-race.cjs`. No migration: `app.BoardPhase` and `app.BoardSprint` came with 037. **Ran green in CI 2026-10-23** (run `39937547186`). |
| 5 | Contracts and pure rules | B1–B2c | **Partial** | `src/modules/boards/schemas/{board,board-rules,board-column,board-card,board-view}.ts` | `boards.test.ts`, `board-columns.test.ts`, `board-cards.test.ts`. Card contracts, the five-set read model, `wipState`, `cardLabel`, `SORT_KEY_GAP` and `REQUIREMENT_STATES` landed. **B3 adds `board-phase.ts`, `board-sprint.ts` and `sprintActions()`**, and moves the sprint row schema out of `board-view.ts` so the ten columns of a sprint are defined once and the read model extends them with its two totals. `board-form.ts` is Open. |
| 6 | Server layer: repository and actions | B1–B2c | **Partial** | `src/modules/boards/repository/{boards,board-columns,board-cards}.ts`, `src/modules/boards/actions/index.ts` | `boards.test.ts`, `board-columns.test.ts`, `board-cards.test.ts`, `actions.test.ts` assert the **exact** `execProc` parameter set per call (the mass-assignment pin). Card, column, **phase and sprint** repositories landed, `getBoard` reads all five sets through `execProcSets`; the card, column, phase and sprint **server actions** are all still deferred to land with the board view that calls them and owns their revalidation routes. |
| 7a | Top-level nav item and route | B1 | **Landed** | `src/components/shell/{nav-items.ts,shell-icons.tsx}`, `src/app/(app)/boards/page.tsx` | `nav-items.test.ts`, `e2e/shell.spec.ts` (e2e not executed here). The page is an honest placeholder, per the convention stated in `nav-items.ts`. |
| 7b | Project section, sidebar create button, the four real routes | B2 | **Open** | — | Deliberately deferred: `project-sections.ts` states the section nav takes **no placeholders**, and a create button pointing at `?id=new` needs the board sheet. See "Deferred on purpose". |
| 8 | Board UI: board view, card, moves, card sheet, planning view, column editor, link dialog | B2–B4 | **Open** | — | The list must be a DataView (`docs/AGENTS.md` quality gate), so no hand-rolled list is acceptable |
| 9 | Requirements packaging and redaction | B5 | **Partial** (was Blocked) | `db/procs/board/usp_Board_GetBoard.sql`, `db/procs/board-card/usp_BoardCard_GetById.sql` | **Unblocked**: the register is on this base, so `app.Requirement` and `requirementRef` are importable. **Redaction landed early, with the read procs**: both report `RequirementState` none/live/restricted/removed, NULL every requirement column for a restricted card, and refuse to match restricted text in a search — leaving a read that leaks once packaging lands was not an acceptable gap. **`usp_BoardCard_Package` and the register's "Add to board…" are still Open.** Redaction is therefore *written but not yet exercisable*: with no Package proc, no card can carry a requirement, so `boards-procs.cjs` cannot build the restricted case. Those db tests land with Package. |
| 10 | Docs | B1–B4 | **Partial** | `docs/adr/ADR-0038-boards.md` (**decisions 23 and 24 added in B4**: the cross-scope access pair, and the foreign-requirement rule with its 50004-not-50007 reasoning), `docs/adr/ADR-0012-proc-error-contract.md` (50007), `docs/adr/README.md`, `docs/MODULE-PROMPTS.md`, `db/README.md`, `db/tests/README.md`, `docs/STANDARDS.md` (50007), `docs/TRACEABILITY.md`, `LESSONS.md` §40–§44, this file | ADR-0039 (colour mode) and the ADR-0028 §8 `execProcSets` note are Open (both land with their slices) |

## Tests

| Suite | Scope | Status | Runs where |
|---|---|---|---|
| `src/modules/boards/tests/boards.test.ts` | board rules, contracts, exact `execProc` parameters per repository call; **B4**: `setBoardProjectInput` drops everything but its four fields, removes no card unless asked, takes a null project to unlink | **Landed** (19) | locally |
| `src/modules/boards/tests/board-columns.test.ts` | column contracts (server-owned fields dropped), exact `execProc` parameters per column call, row-version coercion | **Landed** | locally |
| `src/modules/boards/tests/actions.test.ts` | each intention, revalidation, server-owned fields, unauthenticated | **Landed** (7) | locally |
| `src/components/ui/tests/pointer-drag.test.ts` | pure drag primitives: slop, edge-scroll cap, insertion index | **Landed** | locally |
| `src/lib/tests/errors.test.ts` | every registered THROW number → code, including 50007 | **Landed** | locally |
| `src/modules/boards/tests/board-cards.test.ts` | card contracts (an edit owns no column, sprint, board, requirement or rank), exact `execProc` parameters per card call, the five-set read's parameters and parsing, `wipState`, `cardLabel` not leaking a restricted card | **Landed** (18) | locally |
| `src/modules/boards/tests/board-phases.test.ts` | phase contracts (no board, no sort order on an edit), exact `execProc` parameters per phase call, either date alone | **Landed** (15) | locally |
| `src/modules/boards/tests/board-sprints.test.ts` | sprint contracts (no state or stamp anywhere), exact `execProc` parameters per sprint call including both lifecycle steps, `sprintActions()` against each state | **Landed** (20) | locally |
| `src/tests/board-sql-guardrails.test.ts` | CHECK lists vs TS enums, lock-before-assert, RowVer guard, audit in-transaction, project-from-row, deleted-project hiding, escape chain, static SQL, function folder, payload validation; **board-column block**; **card schema block** (palette, points, composite FKs, table-level content CHECK, both filtered uniques); **card proc block** (WIP checked on exactly Create and Move, the moving card excluded, an edit takes no column/sprint/board/requirement/rank, one-statement renumber, `restricted` before `removed`, search gated on access); **WIP-rule block** (one definition, **both** registered throwers of 50007, helpers refuse outside a transaction, no TS file names them); **phase block** (four procs, assert through the board, lock before assert, RowVer, audit in-transaction, static SQL, no board on an edit, sprints released before the phase goes, Manager to delete); **sprint block** (five procs, no state or stamp on an edit, created planned, the one-active check under the lock before the index, no work-in-progress check on a lifecycle step, completed is read-only and undeletable, unfinished cards move before the close and keep their column) ; **all five folders' write sets now derive from the folder** (`procsIn`/`procsContaining`/`procsTakingRowVer`, B4) instead of hardcoded verb lists that silently stopped covering new procs — `board-card/` had been reading a list for lock, row version *and* audit, so B5's `usp_BoardCard_Package` would have been covered by none of them; the row-version set reads the parameter list alone, so it excludes every `Create` by construction and cannot match a comment. Proven by adding a card proc that declares `@RowVer` and guards nothing; **project-linking block** (B4: the board asked for a delete and the target project for a create in that order, `@AllowProjectless` so an unlink needs no project, no `@ProjectId` on an edit, the refusal is 50004 and never 50007 — asserted on the THROW statements, not the file, because the proc's own header explains why — the scan compares each requirement with the *target* project, an unlink takes no cards, removal needs the flag and audits each card from a snapshot taken before the update, and the count comes back) | **Landed** (79) | locally |
| `src/tests/proc-access-levels.test.ts` | `board` + `board-column` + `board-card` + `board-phase` + `board-sprint` folders registered; both internal helpers `EXEMPT` with reasons; every proc's `@MinLevel`/`@Permission` vs `requiredLevel()`; `Start` and `Complete` mapped to the update verb ; **B4**: the `CROSS_SCOPE` registry for `usp_Board_SetProject` (both calls, in order, each level equal to `requiredLevel()` of its permission, both permissions inside the folder's module), and a meta-assertion that every proc whose checks disagree with each other is registered | **Landed** (469) | locally |
| `src/tests/migration-foreign-key-targets.test.ts` | project-wide, new here: every `REFERENCES` target across `db/migrations/**` is a table some migration creates. Written after `app.[User]` (there is no such table — user FKs are `auth.[User]`) reached migration 038 and passed every local gate, because nothing else reads a migration's object names. Proven by reintroducing the defect and watching it fail | **Landed** (51) | locally |
| `db/tests/boards-procs.cjs` | authorization matrix, standalone shared space, overrides, stale RowVer, payload refusals, LIKE-metacharacter search, deleted project, column create/update/move; **cards** (foreign column/neighbour refused, assignee rule, WIP limit, an edit that moves nothing, the five-set read and its counts, the assignee picker, column delete reflow, last-column refusal); **B4 linking** (each half of the cross-scope pair isolated by an actor who holds one side and not the other, link, move between projects, unlink, stale RowVer, missing id) | **138/138 ran green in CI 2026-10-23** (run `39937547186`): the script completes, so the board, column, card, phase and sprint halves are all proven. Earlier ceilings were 50 (at `57c1c40`) and 120. **The 10 B4 checks are written and not yet run** | CI only |
| `db/tests/boards-race.cjs` | 20 creates into a limit of 5 leave exactly 5; 20 moves into the last free slot leave exactly 1 winner; an unlimited column takes everything; a forced renumber never surfaces as INTERNAL and never leaves two cards sharing a rank; an edit racing a move gives one winner and one CONFLICT; no live card left in a deleted column or on a deleted board. **Added in B3 and now proven**: one sprint starts out of ten parallel attempts (never as 2601), one completion moves the unfinished cards once, no unfinished card is stranded in a completed sprint, and no live card or sprint is left pointing at a deleted sprint or phase. **Added in B4**: linking a board to a project while a user who cannot reach that project moves its cards — every move either beat the link or was refused 50003, exactly the moves that reported success moved a card, and once linked the board refuses the outsider outright even on a stale RowVer, because `usp_BoardCard_Move` asserts access under the board lock before it compares versions. **Still Open**: packaging and link-while-packaging, which need `usp_BoardCard_Package` (B5) and are listed in the file's header | **13/13 ran green in CI 2026-10-23** (run `39937547186`) — its first execution in the module's history. **The 4 B4 checks are written and not yet run** | CI only |
| `e2e/boards.spec.ts`, `e2e/boards-rbac.spec.ts` | the board views and the RBAC matrix | **Open** | CI only |

Local battery after slice B4: `tsc` 0 · **171 files, 8,476 tests, 0 failures** · 90.87 %
statements, 91.76 % lines (gate 80 %) · `eslint` clean and `prettier --check` clean on every changed
file · `node --check` clean on both db scripts. (After B3 it was 8,462 tests, 90.86 % / 91.75 %.)
Nothing in `db/**` runs here: no database — the `docker` CLI is on the PATH but no daemon is
reachable, so nothing database- or browser-shaped can run in this workspace, in any session.
**CI run `39937547186` (`e7b9ec0`) is green**, and it is what proves the database half through
slice B3: both behaviour suites complete, 138 and 13 checks, 0 failed. **Slice B4's own 14 db
checks (10 behaviour, 4 race) have not run anywhere yet** and need a `[db]` push.

**First CI `[db]` run, 2026-10-23** (branch pushed at `ff9d733`): migration 037 applied and every
board and board-column proc was created and exercised for the first time. 46 of 50 checks passed;
the four failures were **one test defect, not a product defect** — `boards-procs.cjs` used user 2
as "an outsider", but the e2e seed makes user 2 `e2e-admin`, a global Admin who is Manager
everywhere (ADR-0021), so the two access checks correctly allowed it; the write that should have
been refused then added a real column, which shifted the two `SortOrder` assertions that follow.
The test now creates its own unassigned user. Recorded as LESSONS §41.

**The card and sprint slices took three more runs to turn green, 2026-10-23**, and every failure
was a test defect rather than a product defect — the procs did what they were told each time:

1. `39933639204` (`8a70f39`) — migration 038 applied and all nineteen procs were created for the
   first time, then `boards-procs.cjs` died with no tally at all. A **fixture leak**: the card half
   revokes `boards:update` for the contributor on project R and never restores it, so the sprint
   lifecycle checks that legitimately expect a contributor to succeed were refused 50003. It had
   also been making two *existing* "a contributor cannot delete …" checks pass for the wrong
   reason. The override is now cleared where it is set, and the restore is itself asserted.
2. `39936353753` (`609c6fa`) — **120 passed**, then a `TypeError`. `usp_Board_GetBoard`'s card set
   is scoped to `ufn_Board_CardsInScope` unless `@View = 'plan'`, and a card left in a completed
   sprint is deliberately outside that scope, so the assertion was reading through the one view
   designed not to show it.
3. `39936919327` (`4f708d4`) — **`boards-procs.cjs` complete at 138**, and `boards-race.cjs` ran
   for the first time ever, reaching 9 before the same view-scope mistake in its own helper. Two of
   its blocks would have **passed vacuously** on the board view, asserting nothing.
4. `39937547186` (`e7b9ec0`) — **green.** Both suites complete.

Recorded as LESSONS §43. The diagnosis cost one run per defect because the scripts crashed without
naming the call; both now print their running tally and the last proc and parameters attempted.

## Invariants and where each is enforced

Mirrors the plan's invariant table; `Database` is the strongest layer and the one to prefer
(`engineering-standards` integrity.md).

| Invariant | Enforced by | Strength | Status |
|---|---|---|---|
| A sprint's phase, and a child's board, are its own board's | composite FKs on `UNIQUE (BoardId, <child>Id)` | Database | **Landed** (037) |
| At most one active sprint per board | `UQ_BoardSprint_Active` filtered unique index + a check under the board lock | Database + proc | **Landed** (B3) — the proc checks under the lock and throws 50007; the index is the backstop, never the answer (ADR-0038 decision 20). **Race-proven in CI** (run `39937547186`). Ten parallel starts across two sprints gave exactly one active sprint, the rest 50007, and no 2601 |
| A sprint's stamps match its state | `CK_BoardSprint_StateStamps` | Database | **Landed** (037) |
| Column category, WIP range, phase and sprint dates are valid | CHECKs + zod, compared by a guardrail | Database | **Landed** (037) |
| A column name is unique per live board | `UQ_BoardColumn_Name` filtered unique index | Database | **Landed** (037) |
| Access is resolved from the row, under the board lock | proc shape + guardrail by position | Proc + guardrail | **Landed** (B1) |
| Stale writes refused; every write audited in its transaction | `CAST(RowVer AS BIGINT) = @RowVer` → 50002; audit insert before COMMIT | Proc + guardrail | **Landed** (B1) |
| A board of a deleted project is unreachable | guard + both list procs filter `p.IsDeleted = 0` | Proc | **Landed** (B1) |
| A card has a title or a requirement; one requirement per board; one card order | table-level `CK_BoardCard_Content` + `UQ_BoardCard_Requirement` + `UQ_BoardCard_SortKey` | Database | **Landed** (038) |
| A card's column and sprint are its own board's | composite FKs `(BoardId, BoardColumnId)` and `(BoardId, BoardSprintId)` | Database | **Landed** (038) |
| Card points and colour are valid | `CK_BoardCard_StoryPoints`, `CK_BoardCard_Color`, compared with the TS enums by a guardrail | Database | **Landed** (038) |
| No column takes a card past its WIP limit | `usp_Board_AssertRoom` under the board lock, counting through `ufn_Board_CardsInScope` | Proc, race-tested | **Landed** (B2c). **Race-proven in CI** (run `39937547186`). |
| A board keeps at least one column | proc check in `usp_BoardColumn_Delete` | Proc | **Landed** (B2c) |
| No live card sits in a deleted column | reflow under the board lock, before the column goes | Proc, race-tested | **Landed** (B2c). **Race-proven in CI** (run `39937547186`). |
| A sprint's state only ever moves planned -> active -> completed | `CK_BoardSprint_State` + `CK_BoardSprint_StateStamps` for the shape; the transition itself by proc under the board lock | Database + proc | **Landed** (B3). The direction cannot be a CHECK without a trigger (a constraint cannot see the previous value), so the proc under the lock is the strongest layer available here, and `Update` takes no `@State` at all — guardrailed |
| A completed sprint never changes | `Update` and `Delete` both refuse it under the lock | Proc | **Landed** (B3) — deliberately irreversible, ADR-0038 decision 21 |
| Every card left in a completed sprint is in a done column | `usp_BoardSprint_Complete` moves the rest in the same transaction | Proc, race-tested | **Landed** (B3). **Race-proven in CI** (run `39937547186`). |
| No live card sits in a deleted sprint, and no live sprint in a deleted phase | the delete procs release their children under the board lock before the row goes | Proc, race-tested | **Landed** (B3). **Race-proven in CI** (run `39937547186`). |
| A card may only be assigned to someone who can reach the board | `usp_BoardCard_AssertAssignee`, which `usp_Board_ListAssignees` mirrors | Proc | **Landed** (B2c) — point-in-time, by design |
| A project board holds only its own project's requirements | `Package`/`SetProject` under the board lock | Proc | **Partial** (was Open) — **`SetProject` landed in B4**: it counts the cards whose requirement belongs to another project and refuses with 50004 unless `@RemoveForeignCards` confirms their removal, which it then audits one row per card. `Package` is B5. Deliberately **not** a composite FK: see ADR-0038 Consequences and decision 24. The rule is guardrailed but **not yet exercised by a db test** — no card can carry a requirement until `Package` exists |
| A board answers to both projects when it moves between them | two `AssertAccess` calls in `usp_Board_SetProject`, with different levels | Proc + guardrail | **Landed** (B4) — Manager on the board with `boards:delete`, Contributor on the target with `boards:create`; pinned by `CROSS_SCOPE` in `proc-access-levels.test.ts`, which also fails if any other proc starts asking two levels unregistered (ADR-0038 decision 23) |
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
- **The phase and sprint server actions, and the planning view** (B3). The plan puts "the
  planning view" in this slice, but it is Part 8 work and Part 8 is deferred whole: the view
  owns the routes those actions revalidate, so the thin action wrappers land with it, exactly
  as the card and column actions did. The mass-assignment property is already pinned at the
  repository layer, where `execProc` is actually called, and `board-phases.test.ts` and
  `board-sprints.test.ts` assert the exact parameter set of every phase and sprint call.
- **`use-pointer-drag.ts`** (B2). The React hook has no consumer until the board view, and an untested
  client hook would not be exercised by any test here. The pure primitives it would wrap have landed.
- **Resolved since B2** — these were deferred for a missing base and are now built:
  `app.BoardCard` and migration 038, column `Delete`, `AssertRoom`, `GetBoard`, `ListAssignees`,
  the card procs and `boards-race.cjs`.
- **Resolved since B2c** — slice B3 built the `board-phase/` and `board-sprint/` procs, their
  contracts and repositories, the four sprint and phase race rows, and widened the 50007
  single-thrower guardrail to its second entry. No migration was needed: `app.BoardPhase` and
  `app.BoardSprint` have been in 037 since B1.
- **Resolved since B3** — slice B4 built `usp_Board_SetProject`, the `CROSS_SCOPE` registry it
  needed, its contract and repository method, the project-linking guardrail block, ten behaviour
  checks and the race row that was waiting on it. No migration: only `app.Board.ProjectId` changes.
  **The link dialog stays deferred with Part 8**, like every other piece of board UI: the view owns
  the routes a link action would revalidate, and the mass-assignment property is already pinned at
  the repository layer, where `execProc` is actually called.
- **Still deferred after B4** — the `@RemoveForeignCards` db checks, which need `usp_BoardCard_Package`
  (B5) before a card can carry a requirement at all. This is the one part of B4 that ships
  guardrailed but unexercised, and it is recorded in the header comment of `boards-procs.cjs` as
  well as in row 4e, so it cannot be mistaken for covered.

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
`ADR-0012`, `adr/README.md`, `TRACEABILITY.md`, `LESSONS.md` §40–41 and the header comment of every
file in `db/procs/board*/` plus migration 037, while the other was untracked. It took 0040 rather
than 0039 because 0039 is itself already named in this file and in the plan. A gap at 0039 is
normal here — 0035 is on another branch and absent from both indexes.

Migrations: **037 and 038** are taken by this module. Next free: **ADR-0041 / migration 039**.
Re-run the two `LESSONS.md` §33 commands before citing any number: the numbers above 0034 live on
branches that can move, and `origin/wip/client-feedback-draft` force-updated during slice B1.

**Coverage check:** every one of the plan's ten parts, its invariant table, its race matrix, its
authorization matrix and its test list appears above with a status. Nothing in the plan is untracked.
