-- usp_Todo_GetUpcomingAlerts — port of Access qryUpcomingAlerts
-- (docs/source/analysis/access-database.md §5): to-dos that are overdue or due within
-- the user's "Due soon" window, excluding Completed/Cancelled. AlertType mirrors the original
-- IIf chain: Overdue (< today) / Approaching Deadline (due within the window) / Normal.
-- The window is app.UserPreference.DueSoonDays (migration 059); no row = 2 days, as in Access.
-- Scoped to @ActorUserId (CreatedBy) so each user sees only their own alerts.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Todo_GetUpcomingAlerts
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Today DATE = CAST(SYSUTCDATETIME() AS DATE);
    DECLARE @DueSoonDays INT = COALESCE(
        (SELECT DueSoonDays FROM app.UserPreference WHERE UserId = @ActorUserId), 2);

    SELECT t.TodoItemId,
           t.[TodoItem],
           t.[DueDate],
           t.[Priority],
           t.[Status],
           CASE
               WHEN t.[DueDate] < @Today THEN N'Overdue'
               WHEN DATEADD(DAY, -@DueSoonDays, t.[DueDate]) <= @Today THEN N'Approaching Deadline'
               ELSE N'Normal'
           END AS AlertType,
           a.TodoAlertId,
           a.[AlertDay],
           a.[AlertTime],
           a.[SnoozeCount],
           a.[MaxSnoozeCount],
           a.[IsDismissed],
           CAST(t.RowVer AS BIGINT) AS RowVer
    FROM app.TodoItem AS t
    LEFT JOIN app.TodoAlert AS a
        ON a.TodoItemId = t.TodoItemId AND a.IsDeleted = 0
    WHERE t.IsDeleted = 0
      AND t.CreatedBy = @ActorUserId
      AND t.[Status] NOT IN (N'Completed', N'Cancelled')
      AND (t.[DueDate] < @Today OR DATEADD(DAY, -@DueSoonDays, t.[DueDate]) <= @Today)
    ORDER BY t.[DueDate] ASC, t.TodoItemId ASC;
END;
GO
