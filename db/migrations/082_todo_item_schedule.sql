-- 082_todo_item_schedule.sql — a to-do can be placed on the planner at a time:
--   app.TodoItem.ScheduledStart / ScheduledEnd (the user's wall-clock time), apart from its
--   StartDate and DueDate, so placing a to-do never moves its dates. Both set or both empty; the
--   end is after the start and no later than the next midnight (CK_TodoItem_Schedule).
--   Existing to-dos have no slot.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.TodoItem', N'ScheduledStart') IS NULL
    ALTER TABLE app.TodoItem ADD ScheduledStart DATETIME2(0) NULL;
GO

IF COL_LENGTH(N'app.TodoItem', N'ScheduledEnd') IS NULL
    ALTER TABLE app.TodoItem ADD ScheduledEnd DATETIME2(0) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_TodoItem_Schedule' AND parent_object_id = OBJECT_ID(N'app.TodoItem'))
    ALTER TABLE app.TodoItem WITH CHECK ADD CONSTRAINT CK_TodoItem_Schedule CHECK (
        (ScheduledStart IS NULL AND ScheduledEnd IS NULL)
        OR (ScheduledStart IS NOT NULL AND ScheduledEnd IS NOT NULL
            AND ScheduledEnd > ScheduledStart
            AND ScheduledEnd <= DATEADD(DAY, 1, CAST(CAST(ScheduledStart AS DATE) AS DATETIME2(0)))));
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = N'IX_TodoItem_ScheduledStart' AND object_id = OBJECT_ID(N'app.TodoItem'))
    CREATE INDEX IX_TodoItem_ScheduledStart ON app.TodoItem (ScheduledStart)
        INCLUDE (ScheduledEnd) WHERE ScheduledStart IS NOT NULL;
GO
