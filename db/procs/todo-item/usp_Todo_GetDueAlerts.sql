-- usp_Todo_GetDueAlerts — returns due and past-due TodoAlert rows in UTC,
-- including all-day alerts with no AlertTime. Excludes dismissed alerts and
-- completed/cancelled to-dos. Scoped to @ActorUserId via TodoItem.CreatedBy.
-- Module: todo-alerts (#20).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Todo_GetDueAlerts
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @NowDate DATE = CAST(SYSUTCDATETIME() AS DATE);
    DECLARE @NowTime TIME(0) = CAST(SYSUTCDATETIME() AS TIME(0));

    SELECT a.TodoAlertId,
           a.TodoItemId,
           t.[TodoItem],
           a.AlertDay,
           a.AlertTime,
           a.SnoozeCount,
           a.MaxSnoozeCount,
           a.IsDismissed,
           CAST(a.RowVer AS BIGINT) AS RowVer
    FROM app.TodoAlert AS a
    INNER JOIN app.TodoItem AS t
        ON t.TodoItemId = a.TodoItemId AND t.IsDeleted = 0
    WHERE a.IsDeleted = 0
      AND a.IsDismissed = 0
      AND t.CreatedBy = @ActorUserId
      AND t.[Status] NOT IN (N'Completed', N'Cancelled')
      AND a.AlertDay IS NOT NULL
      AND (
            a.AlertDay < @NowDate
            OR (a.AlertDay = @NowDate AND (a.AlertTime IS NULL OR a.AlertTime <= @NowTime))
          );
END;
GO
