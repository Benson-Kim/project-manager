# ADR-0052 — The Gantt, work breakdown and Kanban rebuild, and the data behind them

- **Status:** Accepted
- **Date:** 2026-10-30
- **Supersedes:** nothing. Amends ADR-0027 (the WBS/Gantt surface: the outline table and its bars
  are replaced by lanes of cards), ADR-0036 (requirements under WBS items gain priority, criteria,
  effort and an owner), ADR-0038 (a board card may carry a deliverable) and ADR-0046 (milestones
  and dependencies are kept and drawn on the new Gantt).
- **Migrations:** 051_plan_views.sql

## Context

The user asked to recreate the work breakdown, the Kanban boards and the Gantt chart "in
appearance, how it works and functionality without losing the capabilities we already have",
after a single-file design prototype with Roadmap, Work breakdown and Kanban tabs. The client's
1.0.16 requests for these three views were folded in: a colour per deliverable box, a Done button,
Undo, full screen, YYYY-MM-DD dates, "Kanban/Scrum Boards" as the menu name, a visible
"Unassigned" instead of a hard owner rule, and requirement references that read the same in every
view.

Four answers from the user shape everything below:

1. The prototype's Roadmap **is** the Gantt. Nothing in the product is called Roadmap: UI text,
   routes (`?view=gantt`), test ids and code names all say Gantt.
2. The work breakdown has its chart only. The prototype's table tab is not built.
3. Board cards come in both kinds: every board feature stays, and a card may also carry a
   deliverable.
4. The new data is all four groups: MoSCoW per requirement; acceptance criteria, an estimate and
   an owner per requirement; a budget and a note per deliverable plus the project's sticky note;
   and progress from met ticks.

A later answer removed a fifth: the prototype's "replay progress" animation is not wanted, in any
form, and is not to be added back.

## Decisions

### 1. New columns are nullable, with no defaults, so 051 changes no existing meaning

| Table | Column | Rule |
|---|---|---|
| `app.Requirement` | `MoSCoW CHAR(1)` | `CK_Requirement_MoSCoW`: M, S, C or W. NULL is "not prioritised yet" |
| `app.Requirement` | `AcceptanceCriteria NVARCHAR(MAX)` | At most 4000 characters, held by the proc so the limit can move without a migration |
| `app.Requirement` | `EstimateDays DECIMAL(6,1)` | `CK_Requirement_EstimateDays`: >= 0 |
| `app.Requirement` | `OwnerStakeholderId INT` | `FK_Requirement_OwnerStakeholder`, composite over `(OwnerStakeholderId, ProjectId)` against the new `UQ_Stakeholder_Project`, so the owner is a stakeholder of the requirement's own project. A live owner is the proc's check |
| `app.KeyDeliverable` | `Budget DECIMAL(19,2)` | `CK_KeyDeliverable_Budget`: >= 0. Leaves only: a parent's budget is the sum of its sub-items' |
| `app.KeyDeliverable` | `Note NVARCHAR(MAX)` | The note pinned to the item's box |
| `app.Project` | `PlanNote NVARCHAR(MAX)` | The sticky note beside the work breakdown |
| `app.BoardCard` | `KeyDeliverableId INT` | `FK_BoardCard_KeyDeliverable`; see decision 4 |

Owners are stakeholders because deliverable assignees already are (migration 015); one list of
people serves both. The migration is idempotent and every constraint passes on apply, because a
NULL is not checked.

### 2. Progress is derived where it is read, never stored

The rule lives once, in `schemas/wbs.ts` (`requirementsProgress`, `itemProgress`,
`planProgress`), and is unit-tested:

- A requirement with no allocated sub-requirements is 100 or 0 by its met tick.
- A requirement with allocated sub-requirements is the average of them, whatever its own tick
  says: the tick on a parent restates what its children already answer.
- An item with allocated requirements is the average of the tops of that tree.
- An item with none falls back to its status (`statusToCompletion`), so a plan with no
  requirements reads exactly as it did before.
- A parent item is the average of its sub-items; the plan is the average of its top-level items.

Budget and effort roll up the same way (`rolledBudget`, `rolledEffort`) and stay null when
nothing in a branch has one, so "no budget" never reads as 0. Storing any of these would need a
write on every met tick, status change and move, and a stale copy is worse than a recomputation
over a few hundred rows.

### 3. Each new write is its own intention, with the usual three checks

`usp_Requirement_SetMoSCoW` (one chip, one click), `usp_Requirement_SetPlanning` (criteria,
estimate, owner), `usp_KeyDeliverable_SetNote` and `usp_KeyDeliverable_SetPlanNote` each check the
row version (CONFLICT on a stale one), assert access after locking, and write an audit row. The
requirement rules sit in `usp_Requirement_AssertPlanning`, shared by Create and SetPlanning, so
the two cannot drift. Budget rides on `usp_KeyDeliverable_Update`, which refuses a budget on a
parent.

### 4. A board card may carry a deliverable, under the rules a requirement card already has

`CK_BoardCard_Content` is widened: a title, a requirement **or** a deliverable is enough.
`UQ_BoardCard_Deliverable`, filtered to live cards, keeps one card per deliverable per board, as
`UQ_BoardCard_Requirement` does for requirements. `usp_BoardCard_PackageDeliverables` is the
deliverable twin of `usp_BoardCard_Package`: lock the board, then assert Contributor on the board
and read access on every deliverable's project. The deliverable must be in the board's project, or
on a standalone board in any project the actor can read. Deliverables already on the board are
skipped, and the WIP limit counts only the cards actually added.

What a card may show of its deliverable is one inline function, `ufn_BoardCard_Deliverable`, used
by both the board read and the single-card read. A standalone board can hold a deliverable from a
project this reader cannot see: the card then reads `restricted` and every other column is NULL,
decided **before** `removed`, so the reader is never told whether it still exists (the rule
ADR-0038 set for requirements).

### 5. The Gantt is lanes of cards, mapped from the breakdown's levels

A level-1 item with children is a group pill; a level-2 item with children is a lane; every leaf at
level 1 or 2 and every level-3 item is a card; level 4 and below are tiles inside an expanded card.
Cards pack into lines inside their lane (`gantt-layout.ts`), never past the right edge. The
existing scale, requested-date rule, roll-up, cascade of dependent dates, milestones and
FS/SS/FF/SF dependencies with lag (ADR-0046) are kept; arrows are drawn card to card.

Dragging a card's title reschedules it by whole days; dropping it in another lane moves it under
that lane's item; dragging its right edge changes the end; Escape cancels. Each of these, and a
typed date, can be undone (`wbs-undo.ts`). Undo puts the item's own place and dates back; the
successors a cascade pushed stay where they are, as if it had been moved back by hand.

The details panel below the chart edits one item at a time and is keyed by that item, so a field
still being typed in when another card is selected is saved to the item it was typed for, never
to the newly selected one.

The floating toolbar's display settings (progress, dates, today, assignees, milestones) are a
per-viewer preference kept in the browser, not plan data.

### 6. Printing fits the page by zoom, for the chart and the breakdown alike

`usePrintFit` sets one zoom on `beforeprint` so the scrolled chart fits an A4 landscape width and
clears it on `afterprint`. Both the Gantt and the work breakdown carry `data-print-fit`, so one
print rule serves both.

## Consequences

- Existing plans, requirements and boards read the same after 051: every new value is NULL, and
  progress falls back to status where no requirement is allocated.
- Every capability in the old outline survives, with these written-down exceptions:
  - A dependency is no longer drawn by dragging from a bar's edge; it is made from a card's
    Dependencies dialog.
  - Arrows to a group pill or a lane label are not drawn; only card-to-card links are.
  - The breakdown shows no live re-flow while dragging. Hit-testing reads the live layout, so
    moving boxes under the pointer would make the drop target flicker. The ghost and the drop
    marks are the preview.
  - On a standalone board, edit controls on a card's requirement follow the board's access row;
    the server may still refuse, and the refusal shows in the panel.
- Docs and UI say "Gantt" throughout; the prototype's name appears nowhere in the product.

## Tests

- `src/modules/key-deliverables/tests`: progress, budget and effort roll-ups, Gantt layout and
  drag, print fit, undo.
- `src/modules/boards/tests`: deliverable cards, the Kanban filter, stats and board-data export.
- `src/tests/plan-level-contrast.test.ts`: every level, type, MoSCoW and coral pair meets contrast
  in both themes.
- `e2e/key-deliverables.spec.ts`, `e2e/boards.spec.ts`, `e2e/requirements.spec.ts`: the Gantt
  tools, drag and undo, the details panel, deliverable cards, linking a requirement and ticking it
  met.
