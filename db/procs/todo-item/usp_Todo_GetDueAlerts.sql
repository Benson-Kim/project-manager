-- usp_Todo_GetDueAlerts — the to-do alerts that are due (or past due) for one person.
-- AlertDay/AlertTime are the user's wall-clock date and time, as typed in the alert form (and as
-- in Access). @LocalNow is the browser's wall-clock "now"; it is used when it is within 14 hours
-- of UTC (every real time zone), else UTC is (server callers such as the push dispatch).
-- All-day alerts (no AlertTime) are due from the start of their day. Excludes dismissed alerts
-- and completed/cancelled to-dos.
-- Recipients: the person who set the alert and the to-do's owner, while they can still read the
-- to-do under the to-do rule (dbo.ufn_TodoItem_AccessLevel, ADR-0021).
-- Module: todo-alerts (#20).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Todo_GetDueAlerts
    @ActorUserId INT,
    @LocalNow    DATETIME2(0) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    DECLARE @Utc DATETIME2(0) = SYSUTCDATETIME();
    DECLARE @Now DATETIME2(0) =
        CASE WHEN @LocalNow BETWEEN DATEADD(HOUR, -14, @Utc) AND DATEADD(HOUR, 14, @Utc)
             THEN @LocalNow ELSE @Utc END;
    DECLARE @NowDate DATE = CAST(@Now AS DATE);
    DECLARE @NowTime TIME(0) = CAST(@Now AS TIME(0));

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
    CROSS APPLY dbo.ufn_TodoItem_AccessLevel(@ActorRole, @ActorUserId, t.ProjectId, t.CreatedBy) acc
    WHERE a.IsDeleted = 0
      AND a.IsDismissed = 0
      AND (a.CreatedBy = @ActorUserId OR t.CreatedBy = @ActorUserId)
      AND acc.AccessLevel IS NOT NULL
      AND t.[Status] NOT IN (N'Completed', N'Cancelled')
      AND a.AlertDay IS NOT NULL
      AND (
            a.AlertDay < @NowDate
            OR (a.AlertDay = @NowDate AND (a.AlertTime IS NULL OR a.AlertTime <= @NowTime))
          );
END;
GO
