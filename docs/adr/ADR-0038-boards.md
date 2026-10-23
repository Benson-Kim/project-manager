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
  cards table and that foreign key land together in the next boards migration, so the reference is
  never written as an unenforced column.
- The `boards` project section and the sidebar's create button are not registered yet:
  `project-sections.ts` takes no placeholder sections, and a create button pointing at `?id=new`
  needs the board sheet. Both land with the board views.
- No live updates: boards refresh on focus and after each save.

## Alternatives considered

- **Storing an effective level on the board.** Rejected: it would go stale the moment a project
  assignment or an override changed, and ADR-0021 already has one rule.
- **Asserting access before the transaction, as the WBS does.** Rejected: safe only because a
  deliverable never changes project (decision 3).
- **Letting `usp_Board_AssertAccess` take a `@ProjectId`.** Rejected: it hands the caller the choice
  of which project governs the row (decision 4).
- **Hard-coding the default column names in SQL.** Rejected: it puts interface copy in the database
  and splits it from `messages.ts` (decision 9).
