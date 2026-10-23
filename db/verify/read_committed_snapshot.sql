-- read_committed_snapshot.sql — CI assertion for ADR-0045, run as the admin login after
-- scripts/db-apply.sh. It fails when the database still reads with shared locks: the shared-notebook
-- race checks (db/tests/notes-race.cjs) can only finish without a deadlock on versioned reads.
USE ProjectManager;
GO
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE database_id = DB_ID() AND is_read_committed_snapshot_on = 1)
    THROW 50000, N'READ_COMMITTED_SNAPSHOT is off: migration 042 did not apply (ADR-0045).', 1;

PRINT N'READ_COMMITTED_SNAPSHOT is on: reads take no shared locks (ADR-0045).';
GO
