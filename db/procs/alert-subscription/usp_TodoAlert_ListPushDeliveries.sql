-- usp_TodoAlert_ListPushDeliveries — due todo alerts joined to active browser
-- subscriptions. The dispatch route sends one Web Push message per row.
-- An alert goes to its RecipientUserId when set, otherwise to the to-do's creator.
--
-- Delivery rule: usp_AlertSubscription_RecordDelivery records each push per alert,
-- subscription and local day. An alert is listed for a subscription once per local day, so
-- successive scheduler invocations never re-deliver within the day and an alert due later
-- the same day is not held back by an earlier push.
--
-- @LocalNow is the organisation's wall clock, the same clock AlertDay and AlertTime are typed
-- in. It is trusted only within 14 hours of UTC; otherwise UTC is used.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoAlert_ListPushDeliveries
    @LocalNow DATETIME2 = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @NowUtc DATETIME2 = SYSUTCDATETIME();
    IF @LocalNow IS NULL OR ABS(DATEDIFF(HOUR, @NowUtc, @LocalNow)) > 14
        SET @LocalNow = @NowUtc;
    DECLARE @NowDate DATE    = CAST(@LocalNow AS DATE);
    DECLARE @NowTime TIME(0) = CAST(@LocalNow AS TIME(0));

    SELECT s.AlertSubscriptionId,
           s.UserId,
           s.Endpoint,
           s.P256dh,
           s.Auth,
           s.ExpirationTimeUtc,
           a.TodoAlertId,
           a.TodoItemId,
           t.[TodoItem],
           @NowDate AS AlertDate
    FROM app.AlertSubscription AS s
    INNER JOIN auth.[User] AS u
        ON u.UserId = s.UserId AND u.IsDeleted = 0 AND u.IsActive = 1
    INNER JOIN auth.Role AS r
        ON r.RoleId = u.RoleId
    INNER JOIN app.TodoAlert AS a
        ON a.IsDeleted = 0
    INNER JOIN app.TodoItem AS t
        ON t.TodoItemId = a.TodoItemId AND t.IsDeleted = 0
       AND COALESCE(a.RecipientUserId, t.CreatedBy) = s.UserId
    CROSS APPLY dbo.ufn_TodoItem_AccessLevel(r.Name, s.UserId, t.ProjectId, t.CreatedBy) AS acc
    WHERE s.IsDeleted = 0
      AND acc.AccessLevel IS NOT NULL
      AND (s.ExpirationTimeUtc IS NULL OR s.ExpirationTimeUtc > @NowUtc)
      AND NOT EXISTS (
            SELECT 1 FROM app.TodoAlertDelivery AS d
            WHERE d.TodoAlertId = a.TodoAlertId
              AND d.AlertSubscriptionId = s.AlertSubscriptionId
              AND d.AlertDate = @NowDate
          )
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
