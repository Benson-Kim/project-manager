-- 069_todo_item_board_card.sql — a to-do can come from a dated Kanban card, as one can come from a
-- daily activity. The link lets a card hold at most one live to-do, so a second press of the
-- card's "Set a to-do alert" finds the first instead of adding another.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.TodoItem', N'BoardCardId') IS NULL
    ALTER TABLE app.TodoItem ADD [BoardCardId] INT NULL
        CONSTRAINT FK_TodoItem_BoardCard REFERENCES app.BoardCard (BoardCardId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_TodoItem_BoardCard'
               AND object_id = OBJECT_ID(N'app.TodoItem'))
    CREATE UNIQUE INDEX UQ_TodoItem_BoardCard ON app.TodoItem ([BoardCardId])
        WHERE BoardCardId IS NOT NULL AND IsDeleted = 0;
GO
