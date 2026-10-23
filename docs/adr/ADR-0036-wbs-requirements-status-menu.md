# ADR-0036 — Requirements under each deliverable, colour from status, and an item menu

Status: Accepted · Date: 2026-10-20 · Session: wbs-requirements (client feedback)
Amends ADR-0027 (WBS and Gantt). Builds on ADR-0022 (managed lists and option colours) and
ADR-0028 (the minutes' cascade, used here as the model).

## Context

Client feedback on the WBS and Gantt editor (2026-10-20):

- right-clicking an item should open a menu with the toolbar's actions;
- clicking an item should change its colour, "more like changing the status of that item";
- clicking a deliverable's name should open a context menu that shows the whole name (boxes cut it
  to two lines, and the outline to one);
- a deliverable has zero or many requirements;
- the field labelled "Requirement" is really the deliverable, so it should say "Deliverable";
- requirements are added by a click and shown as a cascade, like the meeting agenda, in the WBS and
  in the Gantt.

The user chose (2026-10-20):

- requirements are a **new list under each item**, with no dates or bars of their own, rather than
  renaming sub-items or giving requirements bars;
- a requirement is its **text plus a "met" tick box**;
- **colour follows status**: the box and bar take the colour of the item's status in the managed
  status list, and the separate bar colour goes away.

## Decision

### 1. Requirements (migration 035)

New table `app.KeyDeliverableRequirement`:

- the item's `KeyDeliverableId`, which never changes;
- `Requirement`, required, at most 4,000 characters;
- `IsMet`;
- `SortOrder`;
- soft delete, audit columns and RowVer (ADR-0011).

The procs live in `db/procs/key-deliverable-requirement/`, mapped to the `key-deliverables` module
in `src/tests/proc-access-levels.test.ts`:

| Proc | Does | Level and permission |
|---|---|---|
| `usp_KeyDeliverableRequirement_Create` | adds one last | Manager, `key-deliverables:create` |
| `usp_KeyDeliverableRequirement_Update` | wording and met | Manager, `key-deliverables:update` |
| `usp_KeyDeliverableRequirement_Move` | to a position; renumbers the rest | Manager, `key-deliverables:update` |
| `usp_KeyDeliverableRequirement_Delete` | soft delete; renumbers the rest | Manager, `key-deliverables:delete` |

Each takes the project lock first, as every breakdown write does (ADR-0027 §4–5). Each checks
RowVer, audits inside its transaction and returns the item's `ProjectId`.

- **Reading.** `usp_KeyDeliverable_GanttData` returns each item's live requirements as
  `RequirementsJson`, built `FOR JSON PATH, INCLUDE_NULL_VALUES`. An app from before 035 ignores the
  extra column, and a database from before 035 gives the app none, which it reads as `[]`.
- **The stamp.** The freshness stamp (ADR-0027 §5) is the larger of the newest item RowVer and the
  newest requirement RowVer in the project. A requirement edit therefore orders reads as an item
  edit does.
- **Deleting an item** deletes the requirements of its whole branch and audits each one.
- **The editor** shows each change before the server confirms it, like every other edit
  (`applyRequirementEdit`, `applyRequirementMove`, `applyRequirementDelete`). A new requirement
  shows with a negative id until the server answers, and nothing can act on it until then. An
  update sends the wording and the tick together, taking whichever one was not changed from the
  server's last answer, so a queued tick and a queued rewording do not undo each other.

### 2. Colour follows status

- **Colour.** An item is drawn in the colour its status has in `key-deliverable.status` (ADR-0022).
  An item with no status, or a status without a colour, is grey (`NO_STATUS_COLOR`).
  `buildWbs(items, statusColors)` takes the colours from the page's lookup lists, so an Admin who
  recolours a status changes every box and bar at once. Colours are no longer inherited from
  parents.
- **The stored colour.** `app.KeyDeliverable.Color` stays, so older desktop apps on the same
  database keep working (ADR-0027 §6), but it is no longer drawn. The deliverable form drops its
  "Bar colour" field and sends no colour, so `usp_KeyDeliverable_Update` keeps the stored value
  (`@ColorSet = 0`).
- **Changing the status.** The new `usp_KeyDeliverable_SetStatus` changes only the status: Manager,
  `key-deliverables:update` (verb `SetStatus` in the access test). It checks the list like Update
  does, takes the project lock, audits, and returns the `ProjectId`.
- **Where.** Each box shows its status as a chip, and the Gantt's outline gains a Status column.
  Clicking either opens the item's menu straight on the status list.

### 3. The item menu

`components/wbs-context-menu.tsx`, the same menu in both views.

- **Opening it:**
  - a right-click on a box or a Gantt row (over selected text in a field, the browser's menu stays);
  - a click on a box's name, after 250 ms, so that a double-click still renames;
  - Shift+F10 or the menu key on a focused box or row;
  - the status chip or cell (opens on the status list).
- **Header:** the code, the whole name (wrapped), the dates and the status.
- **Commands:** Add item, Add sub-item, Add requirement, Rename, Status ▸; then Indent, Outdent,
  Move up, Move down, Move to…; then Details and Delete. They act on that item, and are hidden or
  disabled exactly as the toolbar's are.
- **Status ▸:** a submenu of the list's options and "No status", as `menuitemradio`s with their
  colour swatch.
- **Keyboard:** ↑, ↓, Home and End move; → opens the status list; ← and Escape step back; Tab or
  Escape closes it, and the focus returns where it came from.
- **Closing:** a press outside, a scroll or a resize closes it.
- **Rendering:** it is portalled to `<body>` only once open (a client-only state, LESSONS §20), so
  the diagram's CSS zoom and scroll boxes do not affect it.

### 4. The cascade

As the minutes list discussion points under an agenda item (ADR-0028):

- **In a WBS box**, under the dates and the status:
  - a "2 of 3 met" toggle;
  - the requirements on a rail, each with its tick box and wording; clicking the wording edits it,
    and Move up, Move down and Delete appear on hover or focus (always on touch screens);
  - a dashed **Add requirement** button. Its field adds a requirement on Enter and stays open for
    the next; Escape, or leaving it empty, closes it.
- **In the Gantt's outline**, under each item's row:
  - one row per requirement, indented a level deeper: the tick box and wording in the name column,
    the move and delete buttons in the Status column, and an empty track, since requirements have
    no bar;
  - the item's row shows the same toggle;
  - **Add requirement** sits under the selected item only, so the outline does not double in
    length.
- **Shared state:** which items have their requirements folded away is kept per project in the
  viewer's browser (`wbs-req-hidden:<projectId>`), like the collapsed branches, and is shared by
  both views.
- **Deleting** a requirement asks first.

### 5. Labels

- The deliverable's name field reads **Deliverable**:
  - `messages.keyDeliverables.deliverable`, `deliverableRequired` and
    `placeholders.deliverable` replace the `requirement` keys;
  - the column stays `KeyRequirement`, the Access source's name.
- "Enter the requirement" now belongs to the new requirements.

## Consequences

- The WBS boxes grow taller with their requirements. Fit measures the boxes, so it still fits.
- The list view (datasheet) does not show requirements. They are edited in the WBS and Gantt only.
- Printing shows the requirements, without their buttons.
- No data migrates: existing items start with no requirements, and their status colours apply at
  once.
