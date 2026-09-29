-- usp_Todo_GetDueAlerts — returns TodoAlert rows whose AlertDay is today (UTC) and
-- AlertTime has been reached or passed (UTC), are not dismissed, and whose to-do
-- is not Completed or Cancelled. Used by the 60-second client poll to fire browser
-- notifications. Scoped to @ActorUserId via TodoItem.CreatedBy.
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
      AND a.AlertDay = @NowDate
      AND a.AlertTime <= @NowTime;
END;
GO
