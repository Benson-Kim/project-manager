# ADR-0038 — Kanban/scrum boards: the board as its own access scope

Status: Accepted · Date: 2026-10-22 · Session: boards module (#24), slice B1
Amends ADR-0024 (adds `boards` to the overridable sections) and extends the ADR-0021 access rule
with a board rule. Registers the `boards` module.

Build progress against the plan, part by part, is tracked in
[docs/BOARDS-TRACKING.md](../BOARDS-TRACKING.md).

**What has landed with this ADR (slice B1):** migration 037, `db/procs/board/**`, the module's
contracts, repository and actions, the RBAC and guardrail registrations, and the nav item with an
honest placeholder page. Decisions 6 to 9 are recorded here because they shape the schema that
landed, but their procs and views arrive with later slices. Nothing in `db/**` has been executed:
there is no database in the workspace, so migration 037 and every board proc are proven by CI
(`[db]`), not here.

## Context

Teams need a board to run delivery: cards moving through columns, sprints grouped into phases, and
project requirements packaged in as work. Two things make this different from every module so far.

A board may belong to a project or stand alone, and may be linked or unlinked later. Every existing
module's row has a fixed `ProjectId` — the WBS can resolve access before it opens a transaction
(`usp_KeyDeliverable_Move`) because a deliverable never changes project. A board can, so "which
project governs this row" is only answerable under a lock.

A standalone board has no project to govern it at all, so the ADR-0021 rule (a level per project)
returns nothing for it, and the ADR-0024 overrides — which are rows in a project — cannot apply.

## Decision

1. **The board is the access scope.** `dbo.ufn_Board_AccessLevel(@ActorRole, @ActorUserId,
   @ProjectId, @CreatedBy)` is the one rule, an inline table-valued function so a list proc can
   resolve it per row (ADR-0023): a board with a project follows that project
   (`ufn_AccessLevel_Resolve`); a standalone board gives every user Contributor, and its creator —
   or an Admin — Manager. `dbo.usp_Board_AssertAccess` applies it to one board and every board,
   column, phase, sprint and card proc calls it. It is exempt from the
   `src/tests/proc-access-levels.test.ts` scan as a helper (`_AssertAccess`), as the to-do and
   project helpers are.

2. **A standalone board is the shared space, like project-less daily activities.** Everyone can see
   and work it; only its creator or an Admin can delete it or link it to a project. This follows
   `ufn_AccessLevel_Resolve`'s `@AllowProjectless` precedent rather than inventing a second rule.

3. **Lock the board row, then assert access.** Every board write opens its transaction, takes the
   board row `WITH (UPDLOCK, HOLDLOCK)`, and only then calls `usp_Board_AssertAccess`. A check made
   before the lock could be a check against the project the board has just left.
   `src/tests/board-sql-guardrails.test.ts` pins the order by position, so a later proc cannot
   quietly go back to check-then-lock.

4. **The guard reads the project from the row, never from the caller.** `usp_Board_AssertAccess`
   takes no `@ProjectId`; it selects the board's own `ProjectId` and `CreatedBy`. The guardrail
   asserts the parameter list does not mention `@ProjectId`, because a caller that could name the
   governing project could name one it happens to manage.

5. **Overrides reach a project board and never a standalone one.** The guard passes the board's
   `ProjectId` and the `boards:<verb>` permission to `dbo.usp_Permission_Require`, which looks up an
   override only when a project is present — so the standalone case needs no special path, and the
   existing rule stays the only rule. The guard does **not** delegate to
   `usp_Project_AssertAccess`: that would re-resolve a level `ufn_Board_AccessLevel` has already
   resolved, leaving two answers to one question.

6. **Cross-board ids are impossible in the database, not in a proc.** Each child carries `BoardId`
   and reaches its siblings through a composite foreign key built on `UNIQUE (BoardId, <child>Id)`,
   so a sprint cannot sit in another board's phase and a card cannot name another board's column.

7. **At most one active sprint per board**, by a filtered unique index
   (`UQ_BoardSprint_Active ... WHERE [State] = 'active' AND IsDeleted = 0`) as well as a check under
   the board lock. The state and its stamps are tied by `CK_BoardSprint_StateStamps`, so a completed
   sprint can always say when it ran.

8. **Deleting a board deletes only the board row.** Its columns, phases, sprints and cards stay, as
   a project's records stay when the project goes, and nothing can reach them because every board
   read and write resolves the board first. Deleting a *project* does not cascade either, so
   `usp_Board_AssertAccess` and both list procs hide a board whose project was deleted.

9. **Starting columns come from the copy, not from SQL.** `usp_Board_Create` takes
   `@ColumnsJson`; the default names come from `src/lib/messages.ts` through
   `defaultBoardColumns()`. SQL holds no interface text, and the web and desktop editions create
   the same board.

10. **Every value in that payload is checked before the INSERT.** The proc reads each column field
    as text, then validates count, name, category and limit itself. A CHECK violation (error 547) or
    a failed OPENJSON conversion would reach the user as INTERNAL instead of VALIDATION, and
    `JSON_VALUE` on a non-object element raises 13609 (LESSONS §31), so the proc also refuses any
    array element that is not an object (`[type] <> 5`).

11. **An unknown override section is ignored, not a parse error.** `overrideRowSchema` read
    `Module` as `z.enum(OVERRIDABLE_MODULES)`, so a build that predates a section threw a ZodError
    for anyone holding an override of it — locking that user out of the whole project. `Module` is
    now a plain string and one predicate decides what this build can act on. **Desktop edition
    impact:** builds already shipped keep the old behaviour, so granting a `boards` override to a
    user on an older desktop build will lock them out of that project until they update. The
    financials module (5bc4cf5) had the same fault; this is the general fix.

12. **The work-in-progress rule has exactly one definition.** `ufn_Board_CardsInScope` says which
    cards a board is currently working: the active sprint's cards while a sprint is active,
    otherwise every card not in a completed sprint, the backlog included. Both
    `usp_Board_AssertRoom` (the check) and `usp_Board_GetBoard` (the view) read it, so a column's
    "3 / 5" counts exactly the cards drawn under it — by construction, not by two predicates kept
    in step by hand. The earlier rule (every card not in a completed sprint, always) counted cards
    nobody could see, because unfinished cards sent to the backlog keep their column.
    A column may sit **over** its limit without anyone breaking a rule: starting a sprint,
    completing one, or lowering a limit can each leave it there. It then shows as over and takes
    nothing new, rather than the system refusing a sprint the team has planned.

13. **One board-wide rank, with gaps, renumbered in one statement.** Cards carry `SortKey BIGINT`
    with gaps of 2^20, so the board view and the planning view always agree on order and a move
    lands halfway between two neighbours without touching anything else. When neighbours are
    adjacent the board is renumbered first. That rewrite is a **single** UPDATE of every live card:
    a partial rewrite could collide with the rows it left alone and raise 2601 against
    `UQ_BoardCard_SortKey`, which would reach the user as INTERNAL. It bumps every live card's
    RowVer (LESSONS §29), so another user mid-edit gets a CONFLICT — the accepted cost of a board
    that never loses its order. A neighbour that has moved or gone answers 50002, so the client
    reloads rather than the server guessing a position.

14. **`restricted` is decided before `removed`.** A card may carry a requirement from a project the
    reader cannot see, which `usp_Board_GetBoard` and `usp_BoardCard_GetById` report as
    `restricted` with NULL in every requirement column. The CASE tests `restricted` *first*, so a
    reader without access is never told whether the requirement still exists — being told it was
    removed is the same leak by another route. `@Search` is gated the same way: it never matches
    text the reader may not see, because a match would reveal that the text exists.

15. **The assignee rule is written once and read twice.** `usp_BoardCard_AssertAssignee` decides
    who may be assigned, and `usp_Board_ListAssignees` offers exactly who it accepts. If the two
    diverged, the picker would offer someone the write then refuses. Both ask
    `ufn_AccessLevel_Resolve` with `@AllowProjectless = 1`, so on a standalone board every active
    user qualifies. The check is point-in-time: losing project access later does not retroactively
    unassign a card.

16. **Deleting a column moves its cards; it never deletes them, and never takes the last column.**
    `usp_BoardColumn_Delete` asks the target for room for the whole reflow in one
    `usp_Board_AssertRoom` call (`@Adding = n`), because checking one card at a time could refuse
    halfway and leave the board half-emptied. The source column is sized with `@Adding = 0`, which
    never throws — a column already over its limit must still be emptiable. "A board keeps at least
    one column" is a proc check, not a constraint: "at least one" cannot be expressed on the row
    being removed.

17. **A sprint's state changes only through its own intention, never as a field on an edit.**
    `usp_BoardSprint_Update` takes no `@State`, `@StartedAtUtc` or `@CompletedAtUtc`; the lifecycle
    moves through `usp_BoardSprint_Start` and `usp_BoardSprint_Complete`. Each transition *carries
    work with it* — starting a sprint changes which cards every column counts, and completing one
    moves the unfinished cards — so a state field on an edit would make that work a side effect of
    renaming a sprint. A guardrail fails the build if any of the three parameters appears in the
    edit, and `sprintActions()` mirrors the same conditions for the interface without becoming a
    second authority.

18. **Starting or completing a sprint may leave a column over its limit, and is never refused for
    it.** Both transitions change the work-in-progress scope, so a column can go from "3 / 5" to
    "6 / 5" without anyone breaking a rule. Neither proc calls `usp_Board_AssertRoom`: refusing to
    start a sprint the team has planned, or to close one it has finished, because a column would
    read over is the wrong trade. The column shows as over and takes nothing new until it drains,
    which is why `wipState` has an `over` state that is not an error.

19. **50007 has two throwers, and the second was added deliberately.** `usp_Board_AssertRoom` means
    "this column is full"; `usp_BoardSprint_Start` means "another sprint of this board is already
    running". They share `LIMIT_REACHED` because both are a limit of this board that the user can
    see and act on, and the client picks the sentence from the intention invoked
    (`messages.boards.columnFull` against `messages.boards.sprintAlreadyActive`). The guardrail that
    asserted a single thrower existed to force exactly this argument; it now lists both, and a third
    would need the same case made. A refusal that is not a visible limit stays 50004.

20. **The one-active-sprint rule is checked under the board lock, with the index as the backstop.**
    `UQ_BoardSprint_Active` would catch a second active sprint, but as error 2601, which `db.ts`
    maps to INTERNAL — and the plan's race matrix requires "exactly 1 active; the rest 50007, never
    2601". So `usp_BoardSprint_Start` reads the committed state under the lock and throws the honest
    code itself; the index only ever fires if that check is removed.

21. **Completing a sprint keeps the done cards and moves the rest; a card changes sprint, never
    column.** "Unfinished" is decided by the column's category, so what stays in a completed sprint
    is exactly what the team finished — that is what makes the sprint a record. The cards that move
    keep their column, because column and sprint are independent axes of the board and work pulled
    into the next sprint should resume where it was left. There is **no reopen and no undo of a
    completion**: a reopen would have to decide what happens to the cards that moved on, and the
    honest answer is a new sprint. `usp_BoardSprint_Update` and `usp_BoardSprint_Delete` both refuse
    a completed sprint for the same reason.

22. **A planned sprint is deleted, an active one is completed, a completed one is kept.** Deleting
    an active sprint would silently discard the decision `Complete` exists to make — where the
    unfinished work goes; deleting a completed one would destroy the record. A deleted planned
    sprint sends its cards to the backlog with their columns intact. Deleting a **phase** releases
    its sprints to "no phase" rather than taking them with it, which the schema allows and which is
    what stops `FK_BoardSprint_Phase` pointing at a row nobody can see.

## Consequences

- A board's access answer depends on a row that can change, so it is resolved under a lock on every
  write and per row on every read. The only lock taken is one board row; there is no board-wide or
  process-wide lock on a request path.
- `boards` is a Contributor-write module and an overridable section, so it appears in the team's
  cog. `src/tests/proc-access-levels.test.ts` ties each proc's `@MinLevel` and `@Permission` to
  `requiredLevel()`, and pins `usp_ProjectPermission_Set`'s section list to `OVERRIDABLE_MODULES`.
- The inherited `NOT_FOUND`-before-access oracle is **not** reproduced and **not** closed here: it
  needs its own ADR and branch. The board procs return 50001 for a board that is missing, deleted,
  or whose project is deleted, without distinguishing them.
- `app.BoardCard` is deliberately absent from migration 037. Its `RequirementId` references
  `app.Requirement`, which arrives with the requirement register (ADR-0037, migration 036); the
  cards table and that foreign key landed together in **migration 038**, once PR #35 put the
  register on develop, so the reference was never written as an unenforced column.
- A card's requirement is **not** pinned to the board's project by a composite foreign key, even
  though `app.Requirement` carries `UNIQUE (RequirementId, ProjectId)` and one would fit. A board
  can be linked to another project later (`usp_Board_SetProject`), and that key would make a
  legitimate re-link impossible rather than merely checked. "A project board holds only its own
  project's requirements" is therefore a proc rule under the board lock — the one invariant in
  this module deliberately enforced below the strongest available layer, and the reason is the
  re-link, not convenience.
- The `boards` project section and the sidebar's create button are not registered yet:
  `project-sections.ts` takes no placeholder sections, and a create button pointing at `?id=new`
  needs the board sheet. Both land with the board views.
- No live updates: boards refresh on focus and after each save.
- This ADR registers THROW code **50007 `LIMIT_REACHED`** (422) in the ADR-0012 contract, for a
  bounded slot that is full: a column's WIP limit, or a board's one active sprint. The code and its
  mapping landed with slice B2. `usp_Board_AssertRoom` was its first thrower and, until slice B3,
  its only one — the guardrail that asserted that is what forced the second,
  `usp_BoardSprint_Start`, to be argued for rather than added by accident (decision 19). It now
  lists both, and a third would need the same case made.
- **A completed sprint is a one-way door.** There is no reopen and no undo, so the interface must
  name the consequence before it runs (`messages.boards.completeSprintBody`), and the dialog is the
  only protection a user gets. That is deliberate (decision 21), and it is the one place in this
  module where an action is irreversible rather than soft-deleted.
- **Starting or completing a sprint can leave several columns over their limits at once**, because
  the work-in-progress scope changes for the whole board at that moment. Nothing is refused and
  nothing is corrected; the columns show as over and take nothing new. A team that wants the counts
  back under the limits drains them, which is the behaviour the plan asked for.
- `usp_Board_AssertRoom` and `usp_BoardCard_AssertAssignee` are internal helpers: they assert no
  access of their own, because every caller has already locked the board and called
  `usp_Board_AssertAccess`. Both refuse to run outside a transaction, which is what would happen
  if a caller forgot the lock — the count or the project they read would be stale before they
  returned. Both are `EXEMPT` in `src/tests/proc-access-levels.test.ts` with that reason, and a
  guardrail fails the build if any TypeScript file names either of them.

## Alternatives considered

- **Storing an effective level on the board.** Rejected: it would go stale the moment a project
  assignment or an override changed, and ADR-0021 already has one rule.
- **Asserting access before the transaction, as the WBS does.** Rejected: safe only because a
  deliverable never changes project (decision 3).
- **Letting `usp_Board_AssertAccess` take a `@ProjectId`.** Rejected: it hands the caller the choice
  of which project governs the row (decision 4).
- **Hard-coding the default column names in SQL.** Rejected: it puts interface copy in the database
  and splits it from `messages.ts` (decision 9).
