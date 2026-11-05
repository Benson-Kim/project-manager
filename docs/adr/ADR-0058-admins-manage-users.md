# ADR-0058: Admins manage users

- Status: Accepted
- Date: 2026-11-04
- Amended: 2026-11-04 (the audit log; backup status)

## Context

Accounts could only be made by a seed or by hand in the database: `usp_User_Create`, `_List`,
`_Update`, `_Deactivate` and `_SetPassword` existed, but no page or action used them, and none
checked who was calling. The client asked for an administration area. Users come first; the audit
log viewer and the backup status follow.

## Decision

1. Settings > Users (`/settings/users`) lists accounts (name, username, role, status) with search
   and the ADR-0016 paging. An Admin adds a user, edits name, email and role (Administrator |
   User), resets a password, and deactivates or reactivates an account. There is no new top-level
   menu: the Users link sits in an Administration section of Settings, shown to Admins only.
2. Two layers, so hiding the link is never the control:
   - The app. Every write goes through `action()` with the permission `admin:users`; `can()`
     refuses any `admin:*` permission to a User. The page reads in its server component and calls
     `notFound()` for a User, so a User gets a 404, not an empty page.
   - The procs. `usp_User_Create`, `_List`, `_GetById` (another's row), `_SetPassword`
     (another's password) and `usp_User_AssertAdminChange` refuse a non-Admin, a deactivated or a
     NULL actor (`FORBIDDEN_ROW`). A User may still read their own row (the session check does,
     on every request) and set their own password. `_Update` and `_Deactivate` assert before they
     read the target, so an unknown id tells a non-Admin nothing.
3. `usp_User_AssertAdminChange` runs inside the caller's transaction, before its UPDATE. The actor
   must be an active Admin, never changes their own role or deactivates themselves, and never
   leaves the system without an active Admin. It reads the active Admins `WITH (UPDLOCK,
   HOLDLOCK)`, a range lock on `auth.User` held until the caller commits. Two Admins demoting each
   other at once therefore run one after the other, and the second finds that its actor is no
   longer an Admin. The table is small and the action rare, so the lock is acceptable.
4. The last-Admin rule cannot trip today: an active Admin actor other than the target is always
   another active Admin, so the self rule fires first. It stays as defence in depth, in case a
   later caller (a script, a new proc) changes an account without an Admin actor.
5. A role change, a deactivation and a password reset bump `SessionVersion`, so the person's live
   sessions end at once (ADR-0021). A new account and a reset always set `MustChangePassword`; the
   server decides it, never the client. An edit keeps the stored value.
6. Every input schema is `.strict()`. A client cannot send `passwordHash`, `sessionVersion`,
   `failedLoginCount`, `lockedUntil`, `mustChangePassword`, `isDeleted`, `roleId` or extra keys;
   the role arrives by name and the server resolves its id. Update and deactivate carry `RowVer`
   (`CONFLICT` on a stale one). Each write proc audits inside its transaction: the new row for
   create and password reset, the row before and after for update and deactivate.

## Consequences

- An Admin can't lock themselves out, and the system always keeps an active Admin.
- Deactivating is reversible (Reactivate). There is no delete.
- A User who guesses the URL gets a 404; a forged action call gets `FORBIDDEN`, and the proc
  refuses it again.
- Tests: `src/modules/auth/tests/user-admin-actions.test.ts` (gate, strict schemas, server-set
  fields), `src/tests/user-sql-guardrails.test.ts` (the proc checks), `db/tests/users-procs.cjs`
  (refusals, self rule, revocation, the concurrent cross-demotion) and `e2e/admin-users.spec.ts`.

## Amendment: the audit log

Settings > Audit log (`/settings/audit`, linked under Users in the Administration section) lets
an Admin read `audit.AuditLog`.

1. Admin only, in two layers again. Both pages call `notFound()` for a User; the entry page also
   calls it for an id that is not all digits and for one the proc reports `NOT_FOUND`.
   `usp_Audit_List` and `usp_Audit_GetById` check the actor with `usp_User_GetActorRole`
   themselves, so a User, a deactivated or a NULL actor gets `FORBIDDEN_ROW`. GetById checks
   before it looks the id up, so an id tells a non-Admin nothing. The pages read in their server components; there is no
   action, because nothing is written.
2. Read only. Audit rows are append-only: no proc updates, deletes, truncates or merges
   `audit.AuditLog`, and a guardrail fails the build if one does.
3. The list uses the ADR-0016 paging and searches the action, the record's kind and the actor's
   name or username, with "%" and "_" taken literally. It is newest first, oldest first on
   request, and carries no JSON, which can be large. Opening an entry returns both sides, shown
   field by field as a Before/After table with the changed rows marked.
4. Values are rendered as text only, never as HTML, so a stored value cannot inject markup. No
   JSON a proc writes into the log names `PasswordHash` or selects every column of
   `auth.User` (guardrail).
5. A NULL actor reads "System"; an actor whose account row no longer resolves reads "User <id>".
6. A plain table, like Settings > Users, not DataView: there is nothing to edit in place and no
   layout to save.
7. No date filter yet: newest-first paging answers "what happened lately". `@FromUtc`/`@ToUtc`
   go on the list proc when the client asks for a range.

Tests: `src/modules/audit/tests/` (humanized names, the field diff, the repository),
`src/tests/audit-sql-guardrails.test.ts` (the role checks, append-only, no password hash),
`db/tests/audit-procs.cjs` (refusals, literal search, paging, both sides, `NOT_FOUND`) and
`e2e/admin-users.spec.ts` (an Admin reads the deactivation's entry; a User gets a 404).

## Amendment: backup status

Settings > Backup status (`/settings/backup`, linked under Audit log on the desktop only) shows
an Admin this PC's last backup, its last copy off the PC, the last failure of either, and whether
copies are overdue.

1. A file, not a table. The desktop app writes `backup-status.json` in its user data folder
   after every backup of the four kinds (daily, Back up now, before an upgrade, before a
   restore), all through one function, to a temporary file renamed over the old one. A table
   would be rolled back by the restore it is meant to report on, and the record is this PC's
   own state, not app data shared by every user. So there is no migration and no proc. Writing
   it never fails a backup or a restore.
2. One layer for the read. The page calls `notFound()` for a User; with no proc there is no
   second check, and nothing in the file is secret (times, kinds, sizes, the copy folder and an
   error's text). The web app reads the file by the absolute path the desktop app passes in
   `BACKUP_STATUS_FILE`, never a path from a request, against a strict schema: a file in any
   other shape reads as no status rather than being shown in part.
3. The web edition gets a 404. It has no backup file, so `BACKUP_STATUS_FILE` is empty, the
   page calls `notFound()` for an Admin too, and Settings shows no link.
4. Copies are overdue after 7 days without one, or at once when none was ever made. The
   desktop's tray reminder and this page use the same rule. electron/ never imports src/, so
   each side keeps its own copy, and a guardrail keeps the two the same: the 7 days, the
   1000-character cap on error text, the four kinds and the env name.
5. A missing file is unknown, not overdue. A new install, or a PC updated since its last
   backup, has no file until its next backup; the page then says no backup is recorded yet,
   and neither it nor the reminder warns about copies on a guess.
6. Values are shown as text. The copy folder and the error text come from the file and are
   never rendered as HTML.

Tests: `src/modules/backup/tests/` (the schema, the reader, the overdue rules),
`src/tests/backup-status-parity.test.ts` (desktop and web agree),
`electron/tests/backup-status.test.ts` (the writer) and `e2e/admin-users.spec.ts` (the web
edition's 404 and no link, for both roles).
