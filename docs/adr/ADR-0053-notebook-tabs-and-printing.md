# ADR-0053 — Notebook tabs, printed notebooks and a toolbar that stays in view

- **Status:** Accepted
- **Date:** 2026-10-31
- **Supersedes:** nothing. Amends ADR-0035 (a notebook's pages may now be grouped into tabs).
- **Migrations:** 052_note_sections.sql

## Context

A notebook is a list of pages. The client asked for three things on 2026-10-31:

- group a notebook's pages into tabs; a notebook may have tabs or not, and a tab holds at least
  one page, with no maximum;
- print a notebook cleanly;
- keep the editor's toolbar in view while scrolling a long page.

`app.NoteTab` already names a page, so the new grouping table cannot be called a tab in the
database.

## Decision

1. **`app.NoteSection` is a tab.** A page sits in at most one tab through
   `app.NoteTab.NoteSectionId`. The foreign key is composite, (NoteSectionId, NoteId), so a page can
   only sit in a tab of its own notebook. NULL means the notebook has no tabs.
2. **The rules that span rows are kept by the procedures under the notebook's row lock:**
   - a notebook with tabs has every live page in a live tab;
   - a tab keeps at least one page: the last page of a tab cannot be deleted or moved out;
   - a notebook with tabs keeps at least one tab.

   Page order stays note-wide, so the page reorder is unchanged; a tab shows its pages in that
   order.
3. **The first tab takes every existing page.** A later tab starts with one new page.
4. **"Remove tabs" is the way back.** It keeps every page in one list, in the order the tabs
   showed them, so it needs the update right, not delete. Deleting a tab deletes its pages and
   needs the delete right.
5. **Moving a page to another tab** puts it at the end of that tab.
6. **Printing** is a page outside the app shell at `<notebook>/print`. It shows the title, then
   each tab's name and pages, and starts each tab on a new A4 portrait sheet. Its print rules sit
   in the page as a named `@page`, so the Gantt keeps its landscape sheet. The page title is the
   notebook's, so a saved PDF is named after it.
7. **The editor toolbar is sticky** inside the editor box. It sits under the app header through
   `--editor-toolbar-top`, which the shell's main area sets; in sheets and dialogs it sits at the
   top.

## Consequences

- Notebooks made before this keep NULL and read exactly as before.
- Every write that adds, removes or moves a page or a tab takes the notebook's row lock, so two
  people changing tabs never leave a page outside a tab. Renaming a page or a tab does not.
- Tabs and the page moves are audited in the same transaction as the change.
