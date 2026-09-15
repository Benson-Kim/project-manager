-- usp_Todo_GetUpcomingAlerts — port of Access qryUpcomingAlerts
-- (docs/source/analysis/access-database.md §5): to-dos that are overdue or due within
-- 2 days, excluding Completed/Cancelled. AlertType mirrors the original IIf chain:
-- Overdue (< today) / Approaching Deadline (due within 2 days) / Normal.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Todo_GetUpcomingAlerts
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Today DATE = CAST(SYSUTCDATETIME() AS DATE);

    SELECT t.TodoItemId,
           t.[TodoItem],
           t.[DueDate],
           t.[Priority],
           t.[Status],
           CASE
               WHEN t.[DueDate] < @Today THEN N'Overdue'
               WHEN DATEADD(DAY, -2, t.[DueDate]) <= @Today THEN N'Approaching Deadline'
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
      AND t.[Status] NOT IN (N'Completed', N'Cancelled')
      AND (t.[DueDate] < @Today OR DATEADD(DAY, -2, t.[DueDate]) <= @Today)
    ORDER BY t.[DueDate] ASC, t.TodoItemId ASC;
END;
GO
