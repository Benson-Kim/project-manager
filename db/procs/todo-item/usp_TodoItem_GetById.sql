-- usp_TodoItem_GetById — fetch one active app.TodoItem row; THROW 50001 when absent/soft-deleted.
-- Row-level access: dbo.usp_TodoItem_AssertAccess (ADR-0021) — your own to-dos in projects you can
--   read or outside any project; anyone's to-dos in projects you manage. NOT_FOUND (50001) vs FORBIDDEN_ROW (50003).
-- Entity app.TodoItem (source: tblTodoList (core; alert columns → TodoAlert)). Module: todo-items (#20).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_GetById
    @TodoItemId  INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_TodoItem_AssertAccess
         @TodoItemId = @TodoItemId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    SELECT TodoItemId,
           [ProjectId],
           [DailyActivityId],
           [ProjectOrActivity],
           [TodoItem],
           [StartDate],
           [DueDate],
           [Priority],
           [Status],
           [Notes],
           [SortKey],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.TodoItem
    WHERE TodoItemId = @TodoItemId AND IsDeleted = 0;
END;
GO
