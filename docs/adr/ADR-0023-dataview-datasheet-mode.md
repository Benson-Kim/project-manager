# ADR-0023 — DataView datasheet mode (Access-style list view)

Status: Accepted · Date: 2026-10-09 · Session: datasheet (client feedback §2–4)
Amends ADR-0006 (DataView) and ADR-0016 (list proc contract).

## Context

The client works in Access datasheets and asked for the same in the web app:
- spacious bordered cells you type into directly, with no edit modal;
- a persistent "new entry" row with ghost placeholders, ✓ / ×, and Enter to add;
- header carets that edit the dropdown lists (ADR-0022);
- columns they can reorder and resize, and rows they can resize;
- colour-coded rows (High priority, overdue);
- a project dropdown on the cross-project Daily Activities and To-do pages.

They also fixed the Daily Activities column order. Cards (grid view) stay for
mobile.

## Decision

- **List view is the datasheet, and the default.**
  - `initialViewOf(url, preference)` (`src/lib/list-params.ts`) resolves the
    view: the URL's `?view=`, else the user's saved choice, else list.
  - `DataView` gets a `datasheet` prop with `canEditRow`, `saveCell` and an
    optional `addRow`.
  - Columns come from the factories in `columns.tsx`: text, number, date, list,
    boolean and project. Each declares how it reads and how it edits (the form
    field, ghost text, the managed list).
- **A cell edit is a form save.**
  - `formCellSaver` sends the row's form values (`<x>FormValues(row)`) with one
    field replaced to the module's update Server Action. That is the same
    schema, permission, proc and audit as the record sheet.
  - The returned row (new `RowVer`) is merged locally, so a second edit before
    the refresh doesn't conflict.
  - Enter or blur saves. A select saves on change. Esc restores.
- **Per-row permission.**
  - Every DataView list proc returns `ActorAccess` (ADR-0016 contract change),
    and `rowAllows(permission)` gates editing per row.
  - Cross-project lists filter with the inline functions
    `dbo.ufn_AccessLevel_Resolve` and `ufn_TodoItem_AccessLevel`. The
    `ufn_<Entity>_<Noun>` naming is for proc-internal helpers only; the app
    never calls them.
- **The new-entry row is persistent.** It stays under the data with a search or
  filter active too, like Access's new-record row.
  - Ghost placeholders ("[New project name…]") are a documented, client-asked
    exception to STANDARDS §5.1. Every cell still has its own accessible name
    ("New entry: Status").
  - Its starting values come from `CellEditor.initial`, e.g. the filtered
    project. A preset alone is not an entry (`hasDraft(draft, fresh)`).
- **Layout per user per module** (migration 019, `app.ViewPreference.Layout`):
  - `{order, widths, rowHeight}`, validated by `listLayoutSchema`, stored by
    `usp_ViewPreference_SetLayout`. Only differences from the default are kept
    (`normalizeLayout`).
  - Gestures:

    | Change | Pointer | Keyboard |
    |---|---|---|
    | Column order | Drag a header onto another | "Table layout" dialog |
    | Column width | Drag the header's right edge | Focus the edge (WAI-ARIA splitter), arrow keys |
    | Row height (every row, as in Access) | Drag a row's bottom edge | "Table layout" dialog |

  - "Table layout" also has "Reset to default", which clears all three.
  - `orderColumns` ignores unknown keys. A column missing from a saved order
    (one only some pages show, like Project) keeps its default place after its
    default predecessor.
- **Colours** (ADR-0022): a coloured value tints its select cell.
  - A row takes the colour of the module's own `rowTone` (to-dos: overdue →
    red).
  - Otherwise it takes its value in the first column, in display order, whose
    list tints rows.
  - Cell text inherits the row colour.
- **Cross-project lists** (/daily-activities, /todo):
  - The **Project column** (`projectColumn`) shows `ProjectName`, which the list
    procs now return. It is a select of the projects where the actor may
    create, plus "No project" when they may use the shared space
    (`projectPicker`).
  - Daily Activity is an exception to the "parent keys immutable on Update"
    rule (MODULE-PROMPTS): its project is editable, as To-do's already was.
    `usp_DailyActivity_Update` asserts Contributor on the new project too.
  - A **toolbar filter**, `?project=<id>|none`:
    - The page validates it against the actor's visible projects (an unknown
      id never reaches the proc).
    - An id becomes the list proc's `@ProjectId`. "none" is the new
      `@WithoutProject` filter.
    - The new-entry row starts in the filtered project.
- **Daily Activities column order** (client spec), as the default arrangement:
  Project name, Requester, Request date, Contact method, Task or comments, My
  activity or response received, My date, Status, Comments, Completed date.
  Task type, progress, time spent and assigned-to stay in the record sheet.

## Consequences

- Every list module builds its view from the factories. Each adds `<X>_LISTS`,
  `ActorAccess` and `ProjectName` (cross-project lists) to its list row schema,
  and threads `layout` and `initialView` from its page.
- The table scroller is `relative`. Without it, absolutely positioned
  descendants (sr-only labels) belong to `<main>`, and a wide datasheet
  stretches the whole page so the ✓ / × buttons go off-screen.
- e2e specs must not depend on cards: `expectListed`, `openListed` and
  `expectNotListed` (`e2e/support/datasheet.ts`) work in both views.

## Amendment 2026-10-12: sticky header and wrapped text (client feedback)

- **Sticky header.** A horizontal scroller also captures vertical stickiness, so
  the table scrolls inside its own box, at most one screen under the app header
  (`max-h-[calc(100dvh-5rem)]`), and `thead` sticks to it. `scroll-pt-14`
  keeps arrowed rows clear of the header. Print shows the whole table.
- **Wrapped text.** Text cells are `<textarea rows=1>` with
  `field-sizing: content`: text wraps and the row grows to show all of it (the
  row height is the minimum). Browsers without field-sizing scroll inside the
  cell. Enter still saves. Memo fields (`maxLength` above 255 or none) take
  Shift+Enter for a new line; single-line fields turn pasted line breaks into
  spaces. An `<input>` strips line breaks, so focusing and leaving a
  multi-line cell used to save it without them.
- Read-only cells and headers wrap instead of truncating.
- A failed cell save toasts the field's own message (`failureMessage`), e.g.
  "Due date can't be before start date.", since the cell has nowhere to show it.

## Amendment 2026-10-14: rich-text cells (meetings, ADR-0028)

The user decided on 2026-10-11 that rich-text fields are edited in the datasheet, not
shown read-only. Meetings is the first module with them (Objective).

- **Column.** `richTextColumn` declares a cell of kind `rich`. The cell shows the
  formatted text clamped to the row height, as a button named like any cell
  ("Objective, Weekly progress") and described by its text in one plain line.
  Links inside it are inert, so the cell is one tab stop.
- **Editing.** Enter, F2 or a click opens the shared editor (ADR-0025) in a panel under
  the cell, or over it when there is no room below. Shift+F2 opens a larger editor in a
  dialog, like Access's Zoom box; the panel's "Larger editor" button does the same.
  Save or Ctrl+Enter commits and Esc cancels. Leaving the panel commits, as leaving an
  Access cell does. A failed save toasts the message and keeps the editor open with the
  text, so a long edit is never lost to a conflict.
- **Panel.** `AnchoredPanel` (in `dialog.tsx`, the one overlay engine) is a non-modal
  Radix dialog at a fixed position. It follows the cell while the table or the page
  scrolls. Focus returns to the cell unless the user moved on to something else.
  Clicks and keys inside it never reach the row, so they don't open the record or move
  the active row; text typed in a contenteditable counts as typing in a control
  (`isEditableTarget`).
- **The view comes from the server.** The sanitiser never ships to the browser
  (ADR-0025), so the page renders each row's `RichTextView` and passes it with the row
  (`RichCellView`: the node and the HTML it was rendered from). After a save, until the
  refresh brings the new view, the cell shows the saved text as plain text
  (`previewText`), which React escapes.
- **List rows carry the full HTML.** `formCellSaver` rebuilds the whole update form from
  the list row, so a list that returned a preview or plain text would cut the field on
  the next edit of any other cell. `src/tests/datasheet-form-values.test.ts` pins the
  meetings round trip, and `e2e/meetings.spec.ts` edits Location and checks that
  Objective keeps its formatting.
- **New-entry row.** A rich cell there opens the same editor and keeps the HTML in the
  draft until the row is added.
