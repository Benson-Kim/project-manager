# ADR-0063: Undo and redo on every page

- Status: Accepted. Choices not in the client's answers are ours and can be changed.
- Date: 2026-11-12
- Module: app shell and the shared list grid. Builds on ADR-0006, ADR-0023, ADR-0061

## Context

The client wants an Undo and a Redo button on every page that take back at least the last 30 changes and make them again. Three editors already have their own history: the requirement canvas, the WBS/Gantt editor and the responsibility matrix. They share `src/lib/undo-stack.ts` (20 steps) and handle Ctrl+Z inside their own container. Records are saved by Server Actions; every update carries the row's `RowVer` and a stale one is refused with CONFLICT. No module can restore a deleted record.

## Decision

### 1. One history per page

A page's history is kept in the browser, in a store mounted by the app shell, keyed by the page path. The path holds the project id, so each project's page has its own history. It survives moving between pages but not a reload or a sign-out, and at most 30 steps are kept each way. A new change empties Redo.

### 2. A step is a command with its inverse

A step names what it changed (the tooltip reads "Undo: Status") and the records it touches, and knows how to take itself back and make itself again. Both directions call the module's own Server Actions: an edit is saved back to the earlier value, a new record is deleted, and Redo of a new record adds it again. No new endpoint exists for undo, so it passes the same schema, permission, project access check, row version and audit row as a normal edit.

### 3. Never over another user's change

A step writes with the row version this user last wrote, never one read from a refresh. If someone else changed the record since, the save is refused with CONFLICT. The history then drops every step on that record, both ways, and says so. A record that is gone or no longer editable is dropped the same way. Any other failure (offline, server error) leaves the step where it was so it can be tried again.

### 4. Deletes are not undone

No module restores a deleted record, so a delete is not recorded and its confirmation keeps saying it cannot be undone. Undo never pretends to bring a record back.

### 5. Buttons and keys

The buttons sit in the header on every page, disabled when there is nothing to take back or make again. Ctrl+Z is Undo; Ctrl+Y and Ctrl+Shift+Z are Redo (Cmd on a Mac). The shortcut is left to text boxes and rich-text editors, which keep their own undo of typing. An editor with its own history (canvas, WBS/Gantt, responsibility matrix) handles the keys inside itself first; outside it, the page history takes them. Those editors keep their buttons, and their limit goes from 20 to 30.

### 6. What records a step

The shared list grid records cell edits and new rows for every module that uses it. Record sheets record a saved edit as one step. Changes made in pages without a recorder (settings, admin, reports) show the buttons disabled.

## Consequences

- Each module that lets a new row be added in the grid also gives the grid its delete action, so a new row can be taken back.
- An undo after someone else's edit fails safely rather than merging; the user redoes the change by hand.
- The history is lost on reload. Keeping commands across reloads would need a server-side journal; not needed now.
