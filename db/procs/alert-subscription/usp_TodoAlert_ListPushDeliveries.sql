-- usp_TodoAlert_ListPushDeliveries — due todo alerts joined to active browser
-- subscriptions. The dispatch route sends one Web Push message per row.
-- This is intentionally a read: delivery retries are safe because the worker
-- uses the stable todo-alert tag and the push service may retry delivery.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoAlert_ListPushDeliveries
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @NowUtc DATETIME2 = SYSUTCDATETIME();
    DECLARE @NowDate DATE = CAST(@NowUtc AS DATE);
    DECLARE @NowTime TIME(0) = CAST(@NowUtc AS TIME(0));

    SELECT TOP (1000)
           s.AlertSubscriptionId,
           s.UserId,
           s.Endpoint,
           s.P256dh,
           s.Auth,
           s.ExpirationTimeUtc,
           a.TodoAlertId,
           a.TodoItemId,
           t.[TodoItem]
    FROM app.AlertSubscription AS s
    INNER JOIN auth.[User] AS u
        ON u.UserId = s.UserId AND u.IsDeleted = 0 AND u.IsActive = 1
    INNER JOIN app.TodoItem AS t
        ON t.CreatedBy = s.UserId AND t.IsDeleted = 0
    INNER JOIN app.TodoAlert AS a
        ON a.TodoItemId = t.TodoItemId AND a.IsDeleted = 0
    WHERE s.IsDeleted = 0
      AND (s.ExpirationTimeUtc IS NULL OR s.ExpirationTimeUtc > @NowUtc)
      AND a.IsDismissed = 0
      AND t.[Status] NOT IN (N'Completed', N'Cancelled')
      AND a.AlertDay IS NOT NULL
      AND (
            CAST(a.AlertDay AS DATE) < @NowDate
            OR (CAST(a.AlertDay AS DATE) = @NowDate
                AND (a.AlertTime IS NULL OR a.AlertTime <= @NowTime))
          )
    ORDER BY a.TodoAlertId, s.AlertSubscriptionId;
END;
GO
