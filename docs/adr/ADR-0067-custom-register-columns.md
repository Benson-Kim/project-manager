# ADR-0067: The requirement register's own column names and added columns

- Status: Accepted
- Date: 2026-11-12
- Module: requirements. Builds on ADR-0016, ADR-0023, ADR-0024, ADR-0037 and ADR-0066

## Context

On the requirement register the client asked to "add 2 or 3 customizable headers where people can
add a list they can filter etc." and said "it would be good for all headers can have a name change"
(backlog BL02). The user decided on 2026-11-12: names apply per project, "as it gives maximum
flexibility to the user", provided data integrity is kept.

## Decision

### 1. A rename is a label, never a change to data (migration 074)

`app.RequirementLabel (ProjectId, ColumnKey, Label)`, unique per project and key, holds a project's
name for a built-in column. The key is the column's stable key (`Ref`, `Requirement`, `IsMet`, ...),
which the register's layout, sorting, saved views and the CSV export already use; none of them read
the label. Clearing a name deletes the label row and the default comes back; no other row is touched.
The app keeps one list of the built-in columns (`REGISTER_BUILT_IN_COLUMNS`), which both the view and
the procs read.

### 2. Added columns keep their values by id

`app.RequirementColumn` holds up to five live columns per project, of the ADR-0066 kinds date, text
and web link, plus a choice list (`app.RequirementColumnOption`). `app.RequirementCell` stores a value
in the slot its kind uses, keyed by requirement and column id, with composite keys holding the
requirement, the column and the choice in one project. So:

- renaming a column or a choice moves nothing, and a filter (`cf=<column id>.<choice id>`) follows
  the new name;
- deleting a column asks first and is soft: the column, its choices and its values stay in their
  tables, recoverable, and a new column of the same name gets a new id;
- a column's kind changes only while it holds no value (`HasValues`); otherwise the proc refuses;
- a choice that a live requirement holds cannot be deleted; the message says how many hold it.

### 3. Names are checked on the server

A name is trimmed, 1 to 80 characters, and must differ, ignoring case, from every other column the
register shows: the built-in ones (the project's name, else the default) and the added ones. The
server action sends the built-in list to the proc from the app's own constant, never from the browser,
and the proc checks under a lock on the project row. Names render as text only.

### 4. Versions, access, audit

Labels, columns and choices carry a row version; a stale write answers 409. A cell write takes the
requirement's version and bumps it, as any other cell edit does. Renames and added cells are
`requirements:update` (Contributor), adding a column or choice `requirements:create`, deleting one
`requirements:delete` (Manager); per-person overrides apply. Every write audits; a rename records the
old and the new name.

## Consequences

- The register's "Columns" dialog renames any column, adds, renames, moves and deletes added columns,
  changes an empty column's kind and edits choices. A choice column adds a filter to the toolbar.
- Only the requirement register has project names for now; another register would add its own label
  table and procs the same way.
- Sorting by an added column and exporting added columns are left out until asked for.
