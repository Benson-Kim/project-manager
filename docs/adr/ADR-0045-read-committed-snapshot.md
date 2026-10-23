# ADR-0045 — Versioned reads (READ_COMMITTED_SNAPSHOT)

Status: Accepted · Date: 2026-10-24 · Session: notes-editor (amends ADR-0035's race checks)

## Context

The shared-notebook race checks (`db/tests/notes-race.cjs`, ADR-0035 amendment 2026-10-23) end
in "one valid outcome with no deadlock". One CI run failed that: a page delete racing its
notebook's delete was chosen as a deadlock victim (1205). Run repeatedly against a local copy,
the check deadlocked in 5 of 16 runs, each time with a read as one side: `usp_Note_GetWithTabs`
seeks `IX_NoteTab_NoteId`, then looks up `PK_NoteTab`, and holds its shared locks while it reads
the pages' `Content`, while `usp_NoteTab_Reorder` and `usp_NoteTab_Delete` update a page through
`PK_NoteTab` and then its `IX_NoteTab_NoteId` entry: the same two keys in the opposite order. The
CI victim fits the same shape. The page delete's pre-check reads the page and its notebook in
one join, so it can hold the page row while it waits for the notebook that the notebook delete
holds, and that delete next wants the page.

Ordering locks in the writes cannot close this. A read that holds shared locks on several rows
can always meet a write that locks the same rows in another order. The database ran with
locking READ COMMITTED (`is_read_committed_snapshot_on = 0`), where every read takes shared
locks.

## Decision

1. **The database reads committed versions.** Migration 042 sets `READ_COMMITTED_SNAPSHOT ON`.
   A READ COMMITTED read then sees the last committed version of each row and takes no shared
   locks, so a read never blocks a write, never waits for one, and cannot be part of a deadlock.
   No proc changes: READ COMMITTED stays the isolation level everywhere.
2. **Writes keep their locks.** `UPDLOCK`, `HOLDLOCK` and `XLOCK` hints still lock under row
   versioning. Every check-then-write that relies on them (the project lock, `RowVer` checks, the
   notebook lock before a page write) behaves as before.
3. **Applied in place.** `ALTER DATABASE CURRENT ... WITH ROLLBACK IMMEDIATE` works under any
   database name (the desktop app's runner renames scripts to its own) and ends other sessions'
   open transactions, because the switch needs to be the only connection in the database. The
   desktop app applies it at startup, before its server starts. It cannot run in a transaction,
   so the desktop runner re-runs it without one (error 226). The desktop database is owned by
   `pm_app`, which creates it, so no other right is needed. A server applies it in its deploy
   window.
4. **Pinned by the race checks.** `notes-race.cjs` asserts the setting is on before it races.

## Consequences

- A read no longer waits for an uncommitted write: it shows the row as it was. Nothing in the
  app relied on a read waiting, because a plain READ COMMITTED read never held its locks past the
  row anyway. Any check that must see the latest row before writing already takes `UPDLOCK`.
- Updates and deletes keep the old row version in `tempdb` until no read needs it: a little more
  `tempdb` traffic and 14 bytes per changed row. That is small at this app's write rate.
- Every module's reads change, not only the notes procs, and that is deliberate: this class of
  deadlock was possible wherever a read and a write meet the same rows. Each module's race checks
  in CI run against the new setting.
- On a server, the switch disconnects open transactions once, at deploy time.
