-- 007_todo_reorder.sql — add SortKey to app.TodoItem for manual ordering (req 13.2).
-- SortKey is a user-controlled integer; rows default to TodoItemId (stable seed-safe default).
-- The unique filtered index allows ties (two rows may share SortKey temporarily during reorder)
-- so we use a non-unique index instead — ordering is best-effort on SortKey ASC, TodoItemId ASC.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'app.TodoItem') AND name = N'SortKey'
)
BEGIN
    ALTER TABLE app.TodoItem
        ADD [SortKey] INT NOT NULL CONSTRAINT DF_TodoItem_SortKey DEFAULT 0;
END;
GO

-- Back-fill existing rows: SortKey = TodoItemId (preserves current visual order).
UPDATE app.TodoItem SET [SortKey] = TodoItemId WHERE [SortKey] = 0;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_TodoItem_SortKey' AND object_id = OBJECT_ID(N'app.TodoItem')
)
    CREATE INDEX IX_TodoItem_SortKey ON app.TodoItem (ProjectId, IsDeleted, [SortKey]) INCLUDE (TodoItemId);
GO
