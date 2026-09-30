-- 014_daily_activity_project_optional.sql
-- Make DailyActivity.ProjectId nullable so activities can be created without a
-- project (mirrors the original Access source where ProjectID = 0 was used as a
-- sentinel for project-free activities).
USE ProjectManager;
GO

-- 1. Drop the NOT NULL + FK constraint so we can alter the column.
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_DailyActivity_Project_ProjectId')
    ALTER TABLE app.DailyActivity DROP CONSTRAINT FK_DailyActivity_Project_ProjectId;
GO

ALTER TABLE app.DailyActivity
    ALTER COLUMN [ProjectId] INT NULL;
GO

-- 2. Re-add the FK as nullable (ON DELETE NO ACTION is the default).
ALTER TABLE app.DailyActivity
    ADD CONSTRAINT FK_DailyActivity_Project_ProjectId
        FOREIGN KEY ([ProjectId]) REFERENCES app.Project(ProjectId);
GO

-- 3. Rebuild the covering index to keep the NULL-aware filter plan efficient.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DailyActivity_ProjectId' AND object_id = OBJECT_ID(N'app.DailyActivity'))
    DROP INDEX IX_DailyActivity_ProjectId ON app.DailyActivity;
GO
CREATE INDEX IX_DailyActivity_ProjectId
    ON app.DailyActivity (ProjectId, IsDeleted)
    INCLUDE ([RequestDate], [Status])
    WHERE ProjectId IS NOT NULL;
GO
