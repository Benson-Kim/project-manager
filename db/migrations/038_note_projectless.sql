-- 038_note_projectless.sql — notebooks without a project (ADR-0035 amendment 2026-10-23).
--   app.Note.ProjectId becomes nullable, as app.DailyActivity's did in 014: a project-less notebook
--   lives in the shared space every user may read and edit, where deleting needs Manager (Admin)
--   (dbo.ufn_AccessLevel_Resolve with @AllowProjectless = 1, ADR-0021).
--   The FK and IX_Note_ProjectId depend on the column, so they are dropped and recreated around
--   the change. The index stays unfiltered: the cross-project list seeks ProjectId IS NULL too.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COLUMNPROPERTY(OBJECT_ID(N'app.Note'), N'ProjectId', 'AllowsNull') = 0
BEGIN
    IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Note_Project_ProjectId')
        ALTER TABLE app.Note DROP CONSTRAINT FK_Note_Project_ProjectId;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Note_ProjectId' AND object_id = OBJECT_ID(N'app.Note'))
        DROP INDEX IX_Note_ProjectId ON app.Note;
    ALTER TABLE app.Note ALTER COLUMN [ProjectId] INT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Note_Project_ProjectId')
    ALTER TABLE app.Note
        ADD CONSTRAINT FK_Note_Project_ProjectId
            FOREIGN KEY ([ProjectId]) REFERENCES app.Project(ProjectId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Note_ProjectId' AND object_id = OBJECT_ID(N'app.Note'))
    CREATE INDEX IX_Note_ProjectId ON app.Note (ProjectId, IsDeleted) INCLUDE ([Title]);
GO
