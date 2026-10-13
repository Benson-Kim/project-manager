# ADR-0027 — Key deliverables as a work breakdown that draws the Gantt

Status: Accepted · Date: 2026-10-13 · Session: wbs-gantt (client feedback, checklist row 67)
Amends the module #9 Gantt (a read-only bar chart from `usp_KeyDeliverable_GanttData`).

## Context

Checklist row 67 (`docs/source/Project_.xlsx`, columns C and E) shows four images:

- a daily-grid Gantt with one colour per task and the end date on the bar;
- a WBS diagram (ProofHub): the top-level items as boxes side by side, their sub-items stacked
  below each;
- a numbered "New Building" breakdown drawn the same way (1 … 6, then 1.1 … 6.3);
- the same breakdown drawn as a Gantt: an indented tree on the left, summary brackets on parents,
  a month header and zoom.

The client asked on 2026-10-13 for:

- a WBS that builds the Gantt;
- adding, editing and deleting items in the WBS, shown at once in the Gantt;
- dates editable in the WBS as well as on the Gantt;
- bars that move and stretch with the cursor;
- a days, weeks and months timescale, with the dates always visible;
- at least five levels (1, 1.1, 1.1.1 …), each indented.

Later the same day the client asked for the WBS "exactly in the structure shown": adding, editing
and deleting items in that box diagram, moving them by drag and drop, with the items then shown in
the Gantt, and work done in the Gantt shown back in the WBS. The user chose one page with a WBS |
Gantt switch over a stacked "both" view or separate pages.

The Gantt before this drew one bar per deliverable from its creation date (or requested date) to
its deadline. It had no start date, no hierarchy and no editing.

## Decision

### 1. Key deliverables are the breakdown (user decision 2026-10-13)

There is no new entity. Migration 032 adds four columns to `app.KeyDeliverable`:

- `ParentKeyDeliverableId`: a self foreign key; NULL means top level.
- `SortOrder`: the place among siblings.
- `StartDate`: the bar's first day. `Deadline` stays the last day, included.
- `Color`: a palette key, as `app.LookupOption.Color` (migration 020). NULL takes the parent's
  colour, and a top-level item without one is blue.

Existing deliverables become top-level items. Seed 031 gives each a start date (the requested
date, else the day it was created, else the project start, else its deadline) and an order (by
deadline, undated last). Seeds run after migrations on both the desktop and the server.

WBS codes ("2.1.3") are never stored. `usp_KeyDeliverable_List` and the editor compute them from
the place among live siblings, so deleting or moving an item renumbers the rest.

### 2. Parent dates roll up; one bar per item (user decisions 2026-10-13)

An item with sub-items takes its dates from them: the earliest start and the latest end of the
items at the bottom of its branch.

- **`usp_KeyDeliverable_RollUp`** recomputes them inside every change that can move them: Create,
  Update, Delete, Move and Reschedule. It audits each change it makes as `RollUp`.
- **A parent is drawn as a summary bracket.** Dragging it moves its whole branch by the same
  number of days.
- **A parent cannot be stretched.** `usp_KeyDeliverable_Reschedule` refuses a new span, and
  `usp_KeyDeliverable_Update` refuses changed dates on a parent.
- **One bar per item.** Split work is done with sub-items.

### 3. At most ten levels

`usp_KeyDeliverable_AssertPlacement` (`@MaxDepth INT = 10`) refuses a placement, with VALIDATION,
when:

- the parent is not a live item of the same project (BOLA);
- the item would go under itself or one of its own sub-items;
- the parent's level plus the height of the item's branch would exceed ten.

`MAX_WBS_DEPTH` in `schemas/wbs.ts` must equal `@MaxDepth`. `src/tests/wbs-sql-guardrails.test.ts`
checks this.

### 4. Concurrency: lock the project, then check

A move checks "not under its own branch" against the tree. Two concurrent moves could each pass
that check and together make a loop. Every proc that changes the structure or the dates therefore
locks the project row (`UPDLOCK, HOLDLOCK` on `app.Project`) inside its transaction before
checking or writing:

- Create
- Update
- Delete
- Move
- Reschedule

RowVer optimistic concurrency stays per item, as everywhere (ADR-0011).

### 5. Edit procs and the editor's round trip

- **New procs:**
  - `usp_KeyDeliverable_Move`: a new parent and a 1-based position. It renumbers both sibling
    lists.
  - `usp_KeyDeliverable_Reschedule`: both dates.
  - `usp_KeyDeliverable_Rename`.
- **Delete** now removes the item's whole branch, audits every row, and rolls up.
- **Each edit returns the item's `ProjectId`.** The repository then reads that project's breakdown
  (`usp_KeyDeliverable_GanttData`). It never reads a project id the caller names.
- **The editor's actions** (`addWbsItemAction`, `moveWbsItemAction`, `rescheduleWbsItemAction`,
  `renameWbsItemAction`, `deleteWbsItemAction`) answer with the whole breakdown and do not
  revalidate.
- **Optimistic display.** The editor shows each change at once using the same rules as the procs:
  `applyMove`, `applyReschedule` and the rollup in `buildWbs`. It then saves the changes one at a
  time, in order, each with the item's current RowVer. The server's answer replaces the guess, and
  a refused change is undone with an error toast.
- **Freshness stamp.** `usp_KeyDeliverable_GanttData` reads `MIN_ACTIVE_ROWVERSION()` before its
  rows and returns it as `Stamp`. The editor keeps whichever breakdown has the larger stamp, so a
  page refresh that started before a save cannot put back the older breakdown.

### 6. Older app versions on the same database

Desktop installs are per Windows user, so a user can run the app from before 032 against the
upgraded database for a while. The procs accept that app's calls:

- **Create** with no `@StartDate` uses the requested date, else today, but never later than the
  deadline.
- **Update** with no `@StartDate` keeps the start date.
- **Update colour:** `@ColorSet = 0`, the default, keeps the colour.
- **Project-only row:** `usp_KeyDeliverable_GanttData` returns the project-only row for an empty
  project only with `@WithProjectRow = 1`, because the old Gantt cannot parse that row.

### 7. The editor (`/projects/[id]/deliverables/gantt`, "WBS and Gantt")

The outline and the timeline share one scroll container (`data-testid="gantt-chart"`). It has a
sticky two-row date header and a sticky name column.

- **Outline:**
  - each row shows the code, the name indented by level, and a show/hide toggle (the collapsed
    items are remembered per project in this browser);
  - start, end and days fields;
  - typing a start keeps the length, and typing an end or a number of days changes it.
- **Toolbar:** add an item (after the selected one), add a sub-item, indent, outdent, move up, move
  down, details (the existing deliverable form in a sheet, `?d=<id>`), and delete (with a
  confirmation that counts the sub-items). Also expand or collapse all, and Days, Weeks or Months
  (`?scale=`, which keeps the date in view). On a phone, Outline and Chart are two tabs.
- **Keyboard:**
  - in a name being typed, Tab indents and Shift+Tab outdents;
  - on a bar, ← and → move it a day, and Shift+← and Shift+→ move its end; arrow nudges are saved
    600 ms after the last key;
  - Enter or a double-click opens the details.
- **Bars:**
  - drag the body to move, or drag an end to stretch; whole days only;
  - drag across the empty track of an undated item to draw its bar;
  - the dates are written beside every bar, and highlighted while dragging;
  - weekend shading, day or week lines, a today line;
  - a completion fill from the status.
- **Colours** come only from the palette enum. Each maps to Tailwind classes written out in full,
  and no style string comes from data.

### 8. The WBS diagram (`?view=wbs`, the default)

The same editor has two views of the same items, switched by **WBS | Gantt** in the toolbar
(`?view=wbs|gantt`, kept with `history.replaceState`, like `?scale=`). Both share the state, the
save queue, the selection, the collapsed branches and the commands, so a change made in one is in
the other at once, with no reload.

- **Layout** (`components/wbs-diagram.tsx`, as the checklist's two diagrams): the project name in a
  box on top; the top-level items side by side under it, joined by a line; the sub-items of each
  stacked below it, indented a step per level, joined by a rail and ticks. Top-level boxes are
  filled with the item's colour; the boxes below carry it as a stripe. Each box shows the code, the
  name (wrapped) and the dates. A parent has a show/hide toggle that shows how many sub-items are
  hidden.
- **The line under the project box** is the one measured part: it runs from the leftmost to the
  rightmost of the project box's centre and the top-level boxes' centres
  (`connectorSpan`, re-measured by a `ResizeObserver`). The rest is plain flex layout.
- **Drag and drop** (pointer events, no library): with a mouse, drag a box; on a touch screen,
  drag its grip (the box itself scrolls the diagram). Over another box, the middle makes it the
  last sub-item (dashed outline), the leading edge puts it in front and the trailing edge behind
  (a line). Leading and trailing are left and right in the top-level row, top and bottom in a
  column. Dropping on the project box makes it the last top-level item. `dropPlacement`
  (`schemas/wbs.ts`) refuses a drop that changes nothing, goes into the item's own branch, or
  passes ten levels (with the 10-level toast); the server's AssertPlacement checks again. The view
  scrolls near its edges while dragging, and Escape cancels.
- **The single-pointer alternative** (WCAG 2.5.7): Add item, Add sub-item, Indent, Outdent, Move
  up and Move down act on the selected box, as in the outline.
- **Renaming:** double-click, Enter, F2 or the toolbar's **Rename** (new in both views) opens the
  name in the box; Enter or leaving saves, Escape drops it. A new item opens its name at once.
- **Keyboard and screen readers:** an ARIA tree with flat `treeitem`s carrying `aria-level`,
  `aria-setsize`, `aria-posinset` and `aria-expanded`, and a roving tab stop. ↑ and ↓ walk the
  breakdown order, → opens or goes to the first sub-item, ← closes or goes to the parent, Home and
  End, Delete asks to delete.
- **Dates in the boxes** (the client asked the same day): clicking the dates of an item without
  sub-items opens Start and End fields in the box. As in the outline, a new start keeps the length
  and a new end changes it; leaving the fields or Escape closes them. A parent's dates roll up, so
  its box shows them as text.

### 9. Not included

No dependency arrows, critical path, or time of day.

The status, priority and assignee filters of the old Gantt page are gone: a filtered breakdown
would hide the parents that give items their place. The list view keeps its filters.

## Consequences

- The list view sorts by WBS by default and shows the WBS code and the start date. The deliverable
  form requires a start date and offers a bar colour. A parent's dates in the form are read-only
  and labelled as set by its sub-items.
- Every write proc on the module takes the project lock. Writes to one project's deliverables are
  serialised, which is cheap at this scale.
- Rollup and renumbering run on each edit over the project's live items, without paging. A project
  has tens to hundreds of items, not thousands.
- Printing uses the same page. The Months scale fits the most time on a sheet.
