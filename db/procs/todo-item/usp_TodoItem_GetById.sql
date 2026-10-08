-- usp_TodoItem_GetById — fetch one active app.TodoItem row; THROW 50001 when absent/soft-deleted.
-- Actor project-scope: @ActorUserId must be an assignee of the owning project (FORBIDDEN_ROW 50003).
-- Admin bypass: @ActorRole = N'Admin' skips the project-scope check.
-- TodoItem rows without a ProjectId are personal/global; the scope check is skipped for those.
-- Entity app.TodoItem (source: tblTodoList (core; alert columns → TodoAlert)). Module: todo-items (#20).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_GetById
    @TodoItemId  INT,
    @ActorUserId INT,
    @ActorRole   NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:TodoItem not found', 1;

    -- Project-scope check: skip when global (ProjectId IS NULL) or actor is Admin.
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND EXISTS (SELECT 1 FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND ProjectId IS NOT NULL AND IsDeleted = 0)
       AND NOT EXISTS (
           SELECT 1 FROM app.TodoItem ti
           JOIN app.ProjectAssignee pa ON pa.ProjectId = ti.ProjectId AND pa.UserId = @ActorUserId
                                      AND pa.IsDeleted = 0
           WHERE ti.TodoItemId = @TodoItemId AND ti.IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

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
