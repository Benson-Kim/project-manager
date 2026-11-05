-- usp_TodoRecurrence_GetById — how one to-do repeats (ADR-0059), for the to-do form. The key is the
-- series' TodoItemId (the rule is 1:1). No row: the to-do does not repeat. Same columns as the final
-- SELECT of usp_TodoRecurrence_Set; RowVer is the to-do's, the rule's one token.
-- THROW 50001 NOT_FOUND     : the to-do does not exist or is soft-deleted.
-- THROW 50003 FORBIDDEN_ROW : to-do access rule (dbo.usp_TodoItem_AssertAccess, ADR-0021).
-- Module: todo-items.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoRecurrence_GetById
    @TodoItemId  INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_TodoItem_AssertAccess
         @TodoItemId = @TodoItemId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    SELECT r.TodoItemId, r.RepeatUnit, r.RepeatEvery, r.StartTime, r.Weekdays, r.MonthMode, r.Ordinal,
           r.[Weekday], r.EndsOn, r.EndsAfter, CAST(t.RowVer AS BIGINT) AS RowVer
    FROM app.TodoRecurrence r
    JOIN app.TodoItem t ON t.TodoItemId = r.TodoItemId
    WHERE r.TodoItemId = @TodoItemId
      AND t.IsDeleted  = 0;
END;
GO
