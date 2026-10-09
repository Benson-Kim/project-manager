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
