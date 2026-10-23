# ADR-0035 — Notes are notebooks of titled pages

Status: Accepted · Date: 2026-10-17 · Session: notes (module #14, checklist rows 17-20, 42, 56, 62)

## Context

The client wants project notes that behave like a Word document with titled tabs and tables
(rows 17-20). In Access each `tblNotes` row was one titled page (`frmCreateNotePages`). The schema
already has `app.Note` (ProjectId, Title, Content) and `app.NoteTab` (NoteId, Title, Content,
SortOrder), and seed 016 loads 7 notes with no tabs.

## Decision

- A Note is a **notebook**: `Note.Title` is its name. Its pages are `NoteTab` rows, each with a
  title (row 19), rich-text content (the P1 editor, sanitised on the server, ADR-0025) and a
  place (`SortOrder`). `Note.Content` is no longer edited.
- Seed 033 turns each note that never had a page into a notebook whose first page holds its
  Title/Content. It is a seed, not part of migration 026, because seeds run after the migrations:
  on a new database the notes do not exist yet when 026 runs. `db/verify/seed_counts.sql` expects
  7 NoteTab rows.
- Migration 026 adds `NoteTab.SearchText`, the page's plain text. The app writes it with the
  sanitised HTML, and `usp_Note_List` searches the notebook title, page titles and SearchText,
  never the HTML.
- Access as everywhere else (ADR-0021, ADR-0024): reads need Viewer, adding a notebook or a page
  needs Contributor + `notes:create`, renaming, saving and reordering need Contributor +
  `notes:update`, deletes need Manager + `notes:delete`. Page procs take the project from the
  notebook. Deleting a notebook soft-deletes its pages.
- `usp_NoteTab_Reorder` takes the whole order with each page's RowVer, as the meeting reorder
  procs do (ADR-0028). Adding, deleting and reordering pages lock the notebook row.
- UI: the list `/projects/[id]/notes` shows notebooks (title, pages, last edited). The workspace
  `/projects/[id]/notes/[noteId]` is a full route (ADR-0010) with an ARIA tablist of pages and the
  editor for the active page, with an explicit Save and an unsaved-changes guard; switching pages
  with unsaved edits asks first. The section sits in the "Activity" group next to Meetings.

## Consequences

- One editor is mounted at a time, so a long notebook stays light.
- No autosave: an explicit Save keeps the RowVer conflict handling simple.

## Amendment 2026-10-23: notebooks without a project (migration 039)

The client asked for notes at the application level as well as in projects, "just like
activities".

- Migration 039 makes `app.Note.ProjectId` nullable, as 014 did for daily activities. A notebook
  without a project lives in the shared space of ADR-0021: every user reads, creates and edits it
  and its pages (the space resolves to Contributor), and deleting a notebook or a page needs
  Manager, which only an Admin holds there. Every note and page proc passes
  `@AllowProjectless = 1`; a notebook keeps the project it was created in.
- With `@AllowProjectless = 1`, a NULL project resolves to the shared space, so a project notebook
  must never be checked with NULL. Every proc but create and the list reads the project from the
  live note row (through an inner join from a page), stops with NOT_FOUND when the row is gone,
  and passes that id. No proc writes `Note.ProjectId` after create, and the foreign key has no
  `ON DELETE` action. The SQL guardrail pins all of this, including the next note-tab procs
  (images).
- `usp_Note_List` with no project lists every notebook the actor may read: their projects plus the
  shared space (Admin: all). `@WithoutProject = 1` narrows it to the shared space, and each row
  carries `ProjectName`, which is also a sort key.
- UI: `/notes` in the main navigation, after To-do lists, with a Project column and the project
  filter of the other cross-project lists (All, No project, one project). With no project
  filtered, New notebook goes to the shared space. With a project filtered it goes to that
  project, and it is not offered where the actor may not create.
  `/notes/[noteId]` opens a shared notebook and redirects a project's notebook to
  `/projects/[id]/notes/[noteId]`, so its project's levels and navigation apply. Both routes
  render the same `NotebookPage`. When New notebook would go to the shared space it reads
  "New shared notebook", so nobody files private notes there by mistake.
- A notebook holds at most 500 live pages, counted under the notebook lock in
  `usp_NoteTab_Create` (VALIDATION 50004), and the workspace disables Add page at the cap. A
  reorder names every page and takes at most 500, so a longer notebook could never be reordered,
  and in the shared space any user can add pages.
- Tests: `db/tests/notes-procs.cjs` runs the procs in CI: shared-space writes by a Viewer and by a
  user on no project, deletes refused to a project Manager and allowed to an Admin, and the list
  across projects. `db/tests/notes-race.cjs` runs the same procs under concurrency: one winner
  among parallel saves, distinct places for parallel adds, adds and saves against notebook
  deletes (the page goes with it), double deletes, renames and reorders against deletes, the cap
  under parallel adds and under delete-plus-add churn, and a mixed load. Also the SQL guardrails,
  unit tests for the nullable project, and e2e as e2e-pm and e2e-viewer (no Admin login, to keep
  the e2e login budget).
- Known gaps, for later:
  - In the shared space, overwriting a page is as good as deleting it. The old content survives
    only in `audit.AuditLog`, with no restore screen, and a notebook cannot move to a project.
  - Opening a notebook loads and re-sanitises every page, so the read cost grows with the
    notebook (at the cap, about 80 s for 500 full pages). Loading the active page on demand would
    bound it.
