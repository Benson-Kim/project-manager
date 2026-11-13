# ADR-0066: Dynamic checklists and the shared column kinds

- Status: Accepted. The defaults below stand until the client answers the open questions.
- Date: 2026-11-12
- Module: checklists (new). Builds on ADR-0016, ADR-0021, ADR-0023, ADR-0024 and ADR-0063

## Context

The client asked for "a Dynamic Checklist where a person can add an additional '+Add Column'. They
can add 'Date picker', 'text field', 'Document link', 'Action button'" (backlog BL03), and in the
menu they sent it sits under Execution, beside the Kanban board and daily activities. They also asked
for a few columns of their own on the requirements register (BL02), so the kinds of column people
can add are needed by more than one owner.

## Decision

### 1. Several named checklists per project (migration 073)

`app.Checklist` (name unique per project among live rows), `app.ChecklistColumn`, `app.ChecklistItem`
and `app.ChecklistCell`. A row has a title and a done tick that keeps who ticked it and when, then the
added columns in their order. A cell stores its value in the typed slot its column's kind uses
(`TextValue`, `DateValue`, `LinkUrl`, `SignedAtUtc` + `SignedBy`, `TodoItemId`), and a check holds
exactly one slot set; an empty cell has no row. Composite keys tie a cell to a row and a column of
the same checklist, and the checklist to its project, so no value can cross a checklist or a project.

A column's kind never changes once it exists (its values would be reinterpreted); delete it and add
another. Deleting a column soft-deletes it and leaves its cells in place under its id, so its values are
recoverable (user decision 2026-11-12: renames and deletes must keep data integrity); a new column of
the same name is a new id and never inherits them. Renaming a column changes only its name. Limits: 30 live columns and 2,000 live rows per checklist, checked inside the write's
transaction under a lock on the checklist.

### 2. One registry of column kinds, shared by every owner

`src/lib/custom-columns/kinds.ts` holds the kinds (`date`, `text`, `document`, `action`) and the
action kinds (`signoff`, `todo`): each kind's label, value rule (zod), and how the datasheet edits
it. `src/components/custom-columns/` turns a column into a DataView column (dates and text edit in
the cell as any datasheet cell; a link, a sign-off and a to-do are cells of their own) and holds the
"+ Add column" and "Columns" dialogs. A new kind is one registry entry plus its slot in the owner's
cell table. Each owner keeps its own typed tables, as attachment owners do (ADR-0026): there is no
generic value table shared across modules. A guardrail test keeps the registry and the migration's
`CHECK` lists equal.

### 3. Values are checked twice, the database's check holds

The action checks a value with the registry so a typo comes back as a field message; the proc reads
the column's kind itself and checks again (a date is `YYYY-MM-DD`; text at most 2,000 characters; a
link is an `http://` or `https://` address of at most 2,048 characters with no spaces or angle
brackets; a sign-off is on or off). A link renders only when it passes the same rule, opens in a new
tab with `rel="noopener noreferrer"`, and the table's check keeps any other scheme out of storage.

### 4. Versions and audit

Checklists, columns and rows carry a row version. A cell write takes the row's version and bumps it,
so two people on one row get a 409 instead of overwriting each other. Every write audits in its
transaction. Cell edits and new rows are steps of the page's Undo history (ADR-0063); a button press
and a delete are not.

### 5. Access

New permission module `checklists`, a Contributor-write and overridable section. Viewers read;
Contributors add checklists, columns and rows, tick, fill cells, rename and move columns; Managers
delete checklists, columns and rows. The to-do button makes a to-do in the checklist's project, so it
asks for `todo-items:create` there, and a cell keeps the to-do it made: pressing again finds it,
and once that to-do is deleted the button makes a new one.

## Client questions, with the defaults taken

| Question | Default |
|---|---|
| What does the action button do? | Chosen when the column is added: Sign off (who and when; press again to clear) or Create to-do (from the row's title, due on the row's first date) |
| Is a document link a web address, a file in the app, or a network path? | A web address (http/https). Files and network paths wait for the answer |
| One checklist per project, or several? | Several, named, with a picker |
| Who may add, rename and delete columns? | Add and rename: Contributors; delete: Managers |
| Should the "Integrated Board" also show Kanban cards or to-dos? | No; a plain checklist now |
| Can a column's kind change once it holds values? | No; delete it and add another |

## Consequences

- The checklist page is a datasheet like the other registers: search, title sort, pages of 25 read in
  SQL, a new-entry row, saved column widths and order.
- Row reordering, files attached to a document cell and network paths are left out until asked for.
- The menu entry goes under Execution with the section regrouping.
