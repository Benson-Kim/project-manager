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
- **No end before its requested date** (amended 2026-10-14). Create and Update already refuse a
  deadline before the row's own requested date. That now holds for dates set by a drag or by the
  rollup:
  - Reschedule refuses an item's new end before its requested date, and a branch move that would
    end a sub-item before its own;
  - RollUp refuses any change that would end a parent before its requested date, so Create,
    Update, Delete and Move keep the rule too. A parent that already ended before its requested
    date is not held to it;
  - the editor checks the same rules before it sends a drag (`requestedDateClash`), and says which
    one stopped it.
- **The rollup works on one branch** (amended 2026-10-14). `@FromKeyDeliverableId` recomputes that
  item and the items above it, which is all one change can move. Every write proc passes its own
  item: Move also passes its old parent, and Delete passes the item it has just deleted, whose
  parents still count. Without it the whole project is recomputed; no proc does that now. Measured
  on a 1,620-item project (two runs, a noisy machine):
  - Reschedule an item: ~210 ms → ~15–25 ms;
  - move a 151-item branch: ~270 ms → ~60–70 ms;
  - Create, Update, Move and Delete: ~250–400 ms → ~20–45 ms;
  - the rollup's reads: ~44,000 → ~1,750.

  After each kind of write, a whole-project rollup finds nothing left to change.
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
- **Freshness stamp.** `usp_KeyDeliverable_GanttData` reads the newest `RowVer` among the
  project's items, deleted ones included, before its rows and returns it as `Stamp`. A save
  answer is kept when its stamp is not older than the editor's; a page refresh likewise (an equal
  stamp is the same items, maybe with newer assignee names). So a refresh that started before a
  save cannot put back the older breakdown. Every write to an item, Rename included, locks the
  project row first, so RowVer order is commit order. (Amended 2026-10-14: the stamp was
  `MIN_ACTIVE_ROWVERSION()`, which stays put while any other transaction in the database is open,
  so a refresh after editing an item's details could be refused and leave stale RowVers behind.)

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
  - a completion fill from the status;
  - each bar is a button at least 40 px each way (STANDARDS §5.3), centred on however thin or
    short the bar is drawn; the focus ring stays on the drawn bar (amended 2026-10-14).
- **Elsewhere in the module** (amended 2026-10-14):
  - in the list's datasheet a parent's Start and Deadline are shown, not edited (a column can name
    the rows whose cells are edited, `ColumnSpec.editable`);
  - deleting a parent from its details names how many sub-items go with it, as the editor's delete
    does. `usp_KeyDeliverable_GetById` returns `SubItemCount`, which costs ~7 ms more for an item
    with 160 items below it.
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
  **Amended 2026-10-17 (client feedback):** every level is laid out like the top one: an item's
  sub-items sit side by side under it, joined by the same lines, so the chart reads across at
  every level instead of stacking below the first. The lines are plain CSS on each box's wrapper
  (a stub up from the box, and a half or whole line along the siblings' row), so nothing is
  measured. A chart wider than its view opens scrolled to its middle, under the project box.
  **Amended 2026-10-17 again (client feedback, wide breakdowns):** side by side at every level
  made a project of four items with four to six sub-items each about 5,000 px wide. The chart now
  fits its width: the top-level items always sit side by side; below them a branch sits side by
  side while the chart still fits, and is otherwise listed under its parent on a rail (the
  original layout). `branchRows` (`components/wbs-diagram-layout.ts`) decides level by level,
  shallow first and the cheapest branch first, so small branches sit side by side and big ones
  are listed; a branch with one sub-item always sits side by side (it is no wider). The viewer
  can set a branch side by side (which opens the branches above it too) or listed, with the
  switch on the line under its box or **Sub-items** (Automatic, Side by side, Listed) in the
  toolbar; zoom (−, +, 100 %, Fit: the largest step up to 100 % at which the whole chart is on
  screen); and drag the chart's right edge (a window splitter, also by keyboard; double-click or
  **Window width** to go back) to lay it out wider or narrower. These are kept per project in the
  viewer's browser, like the collapsed branches. The geometry is one set of rem values
  (`CHART_REM`), read by the markup as CSS variables and by the layout as numbers; only the view's
  width, the root font size and, for Fit, the boxes' heights are measured.
- **Drag and drop** (pointer events, no library): with a mouse, drag a box; on a touch screen,
  drag its grip (the box itself scrolls the diagram). Over another box, the middle makes it the
  last sub-item (dashed outline), the left edge puts it in front and the right edge behind
  (a line), at every level; in a listed branch the top and bottom edges do (amended
  2026-10-17). Dropping on the project box makes it the last top-level item. `dropPlacement`
  (`schemas/wbs.ts`) refuses a drop that changes nothing, goes into the item's own branch, or
  passes ten levels (with the 10-level toast); the server's AssertPlacement checks again. The view
  scrolls near its edges while dragging, and Escape cancels.
- **The single-pointer alternative** (WCAG 2.5.7): Add item, Add sub-item, Indent, Outdent, Move
  up and Move down act on the selected box, as in the outline. Amended 2026-10-17: Alt+↑ and
  Alt+↓ move the focused box among its siblings, Alt+→ and Alt+← indent and outdent it (it keeps
  the focus), and **Move to…** sends the selected item under any other item, or to the top level,
  at the place picked among its new siblings (items in its own branch, and parents it would pass
  ten levels under, are not offered); both use the same move as dragging.
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
- Renumbering runs on each edit over one list of siblings, and the rollup over the changed branch
  and the items above it (amended 2026-10-14; it was the whole project). A project has tens to
  hundreds of items, not thousands.
- Printing uses the same page. The Months scale fits the most time on a sheet.
