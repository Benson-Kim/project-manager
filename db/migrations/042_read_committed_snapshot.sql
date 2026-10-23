-- 042_read_committed_snapshot.sql — versioned reads (ADR-0045).
--   READ_COMMITTED_SNAPSHOT ON: a READ COMMITTED read sees the last committed version of a row
--   instead of taking shared locks, so a read can no longer deadlock with a write. The notes race
--   checks caught usp_Note_GetWithTabs and the page delete's pre-check as deadlock victims (1205):
--   each held shared locks on app.NoteTab while a write locked the same rows the other way round.
--   Lock hints (UPDLOCK, HOLDLOCK, XLOCK) still take locks, so every write keeps its ordering.
--   The switch needs this to be the only connection in the database: WITH ROLLBACK IMMEDIATE ends
--   any other session's open transaction. The desktop app applies it at startup, before its server
--   starts; on a server, apply it in the deploy window. ALTER DATABASE cannot run in a transaction,
--   so the desktop runner re-runs this script without one (error 226).
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF EXISTS (SELECT 1 FROM sys.databases WHERE database_id = DB_ID() AND is_read_committed_snapshot_on = 0)
    ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
GO
