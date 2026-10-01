-- usp_AlertSubscription_RecordDelivery — stamp the last successful push send
-- time on a subscription row.  Called by the dispatch route after every
-- successful sendTodoAlertPush so that the next scheduler invocation skips
-- this row until a new day begins (UTC), preventing the fixed-batch starvation
-- described in the delivery query.
-- @ActorUserId = 0 is the trusted dispatch service.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AlertSubscription_RecordDelivery
    @AlertSubscriptionId INT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    UPDATE app.AlertSubscription
    SET LastPushSentAtUtc = SYSUTCDATETIME(),
        UpdatedAtUtc      = SYSUTCDATETIME(),
        UpdatedBy         = @ActorUserId
    WHERE AlertSubscriptionId = @AlertSubscriptionId
      AND IsDeleted = 0;
END;
GO
