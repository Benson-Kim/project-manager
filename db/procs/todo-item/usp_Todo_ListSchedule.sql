-- usp_Todo_ListSchedule — the planner's to-dos from @From to @To inclusive (at most 31 days): those
--   placed at a time that starts in the window (ScheduledStart, migration 082). Only placed to-dos
--   show; a to-do's dates alone never put it on the planner.
-- Row-level access as usp_Todo_ListCalendar: a supplied @ProjectId must be readable
-- (dbo.usp_Project_AssertAccess -> FORBIDDEN_ROW 50003); rows follow the to-do rule
-- (dbo.ufn_TodoItem_AccessLevel, ADR-0021).
-- THROW 50004 VALIDATION : no window, @To before @From, or more than 31 days.
-- Module: todo-items.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Todo_ListSchedule
    @ActorUserId INT,
    @ProjectId   INT = NULL,
    @From        DATE,
    @To          DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @From IS NULL OR @To IS NULL OR @To < @From OR DATEDIFF(DAY, @From, @To) + 1 > 31
        THROW 50004, N'VALIDATION:Choose a window of 1 to 31 days', 1;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    IF @ProjectId IS NOT NULL
        EXEC dbo.usp_Project_AssertAccess
             @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    DECLARE @Start DATETIME2(0) = CAST(@From AS DATETIME2(0));
    DECLARE @End   DATETIME2(0) = DATEADD(DAY, 1, CAST(@To AS DATETIME2(0)));

    SELECT t.TodoItemId,
           t.ProjectId,
           (SELECT p.ProjectName FROM app.Project p WHERE p.ProjectId = t.ProjectId) AS ProjectName,
           t.TodoItem,
           t.StartDate,
           t.DueDate,
           t.[Priority],
           t.[Status],
           t.Assignee,
           CAST(t.RowVer AS BIGINT) AS RowVer,
           acc.AccessLevel AS ActorAccess,
           t.ScheduledStart,
           t.ScheduledEnd
    FROM app.TodoItem t
    CROSS APPLY dbo.ufn_TodoItem_AccessLevel(@ActorRole, @ActorUserId, t.ProjectId, t.CreatedBy) acc
    WHERE t.IsDeleted = 0
      AND acc.AccessLevel IS NOT NULL
      AND (@ProjectId IS NULL OR t.ProjectId = @ProjectId)
      AND t.ScheduledStart >= @Start AND t.ScheduledStart < @End
    ORDER BY t.ScheduledStart, t.TodoItemId;
END;
GO
