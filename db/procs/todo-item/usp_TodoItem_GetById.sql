-- usp_TodoItem_GetById — fetch one active app.TodoItem row; THROW 50001 when absent/soft-deleted.
-- Entity app.TodoItem (source: tblTodoList (core; alert columns → TodoAlert)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_GetById
    @TodoItemId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:TodoItem not found', 1;

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
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.TodoItem
    WHERE TodoItemId = @TodoItemId AND IsDeleted = 0;
END;
GO
