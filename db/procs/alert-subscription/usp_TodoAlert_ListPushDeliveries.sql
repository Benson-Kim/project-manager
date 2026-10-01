-- usp_TodoAlert_ListPushDeliveries — due todo alerts joined to active browser
-- subscriptions. The dispatch route sends one Web Push message per row.
--
-- Rotation guarantee: after a successful send the dispatch route calls
-- usp_AlertSubscription_RecordDelivery which stamps LastPushSentAtUtc on the
-- subscription row.  This proc filters out any subscription that was already
-- sent to today (UTC), so successive scheduler invocations never re-deliver
-- within the same day and every subscription in the result set is a fresh one.
-- There is therefore no TOP(n) cap: a bounded number of due rows can exist
-- (one per active alert per active subscription) and each batch processes them
-- all.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoAlert_ListPushDeliveries
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @NowUtc  DATETIME2 = SYSUTCDATETIME();
    DECLARE @NowDate DATE      = CAST(@NowUtc AS DATE);
    DECLARE @NowTime TIME(0)   = CAST(@NowUtc AS TIME(0));

    SELECT s.AlertSubscriptionId,
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
      -- Skip subscriptions already delivered today so each invocation
      -- processes only fresh rows and all subscriptions rotate fairly.
      AND (s.LastPushSentAtUtc IS NULL
           OR CAST(s.LastPushSentAtUtc AS DATE) < @NowDate)
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
