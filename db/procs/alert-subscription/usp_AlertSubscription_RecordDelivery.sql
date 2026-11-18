-- usp_AlertSubscription_RecordDelivery — record one successful push of an alert to a
-- subscription for a local calendar day. The delivery list skips a recorded
-- (alert, subscription, day), so an alert is pushed once per subscription per day and an
-- alert due later the same day is still delivered. Recording the same delivery twice leaves
-- one row.
-- @ActorUserId = 0 is the trusted dispatch service.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AlertSubscription_RecordDelivery
    @AlertSubscriptionId INT,
    @TodoAlertId         INT,
    @AlertDate           DATE,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM app.AlertSubscription WHERE AlertSubscriptionId = @AlertSubscriptionId)
       OR NOT EXISTS (SELECT 1 FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId)
        RETURN;

    BEGIN TRAN;

    IF NOT EXISTS (
        SELECT 1 FROM app.TodoAlertDelivery WITH (UPDLOCK, HOLDLOCK)
        WHERE TodoAlertId = @TodoAlertId
          AND AlertSubscriptionId = @AlertSubscriptionId
          AND AlertDate = @AlertDate
    )
        INSERT INTO app.TodoAlertDelivery (TodoAlertId, AlertSubscriptionId, AlertDate)
        VALUES (@TodoAlertId, @AlertSubscriptionId, @AlertDate);

    UPDATE app.AlertSubscription
    SET LastPushSentAtUtc = SYSUTCDATETIME(),
        UpdatedAtUtc      = SYSUTCDATETIME(),
        UpdatedBy         = @ActorUserId
    WHERE AlertSubscriptionId = @AlertSubscriptionId
      AND IsDeleted = 0;

    COMMIT;
END;
GO
