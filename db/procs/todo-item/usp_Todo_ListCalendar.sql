-- usp_Todo_ListCalendar — what a calendar window shows (ADR-0059), @From to @To inclusive, at most
-- 62 days. Two result sets; the app works the occurrences out from them:
--   1. To-dos, the rule LEFT JOINed (RepeatUnit NULL = a one-off). One-offs that start in the
--      window; series that start by @To and do not end before @From, or have an occurrence moved
--      into the window.
--   2. Those series' occurrence rows that start in the window or were moved into it.
-- Row-level access as usp_TodoItem_List: a supplied @ProjectId must be readable
-- (dbo.usp_Project_AssertAccess -> FORBIDDEN_ROW 50003); rows follow the to-do rule
-- (dbo.ufn_TodoItem_AccessLevel, ADR-0021).
-- THROW 50004 VALIDATION : no window, @To before @From, or more than 62 days.
-- Module: todo-items.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Todo_ListCalendar
    @ActorUserId INT,
    @ProjectId   INT = NULL,
    @From        DATE,
    @To          DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @From IS NULL OR @To IS NULL OR @To < @From OR DATEDIFF(DAY, @From, @To) + 1 > 62
        THROW 50004, N'VALIDATION:Choose a window of 1 to 62 days', 1;

    -- The actor's role is read from auth.User, never trusted from the caller.
    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    IF @ProjectId IS NOT NULL
        EXEC dbo.usp_Project_AssertAccess
             @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    -- DATETIME2 columns: the window ends before the day after @To.
    DECLARE @Start DATETIME2 = CAST(@From AS DATETIME2);
    DECLARE @End   DATETIME2 = DATEADD(DAY, 1, CAST(@To AS DATETIME2));

    DECLARE @Shown TABLE (TodoItemId INT PRIMARY KEY, AccessLevel NVARCHAR(20));
    INSERT INTO @Shown (TodoItemId, AccessLevel)
    SELECT t.TodoItemId, acc.AccessLevel
    FROM app.TodoItem t
    CROSS APPLY dbo.ufn_TodoItem_AccessLevel(@ActorRole, @ActorUserId, t.ProjectId, t.CreatedBy) acc
    LEFT JOIN app.TodoRecurrence r ON r.TodoItemId = t.TodoItemId
    WHERE t.IsDeleted = 0
      AND acc.AccessLevel IS NOT NULL
      AND (@ProjectId IS NULL OR t.ProjectId = @ProjectId)
      AND ((r.TodoItemId IS NULL AND t.StartDate >= @Start AND t.StartDate < @End)
           OR (r.TodoItemId IS NOT NULL
               AND ((t.StartDate < @End AND (r.EndsOn IS NULL OR r.EndsOn >= @From))
                    OR EXISTS (SELECT 1 FROM app.TodoOccurrence o
                               WHERE o.TodoItemId = t.TodoItemId
                                 AND o.MovedTo >= @Start AND o.MovedTo < @End))));

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
           s.AccessLevel AS ActorAccess,
           r.RepeatUnit, r.RepeatEvery, r.StartTime, r.Weekdays, r.MonthMode, r.Ordinal, r.[Weekday],
           r.EndsOn, r.EndsAfter
    FROM @Shown s
    JOIN app.TodoItem t ON t.TodoItemId = s.TodoItemId
    LEFT JOIN app.TodoRecurrence r ON r.TodoItemId = t.TodoItemId
    ORDER BY t.StartDate, t.TodoItemId;

    SELECT o.TodoOccurrenceId, o.TodoItemId, o.OccursAt, o.[Status], o.MovedTo, o.IsSkipped,
           CAST(o.RowVer AS BIGINT) AS RowVer
    FROM @Shown s
    JOIN app.TodoOccurrence o ON o.TodoItemId = s.TodoItemId
    WHERE (o.OccursAt >= @Start AND o.OccursAt < @End)
       OR (o.MovedTo >= @Start AND o.MovedTo < @End)
    ORDER BY o.TodoItemId, o.OccursAt;
END;
GO
