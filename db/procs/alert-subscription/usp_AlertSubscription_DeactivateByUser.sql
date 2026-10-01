-- usp_AlertSubscription_DeactivateByUser — retire all active push subscriptions
-- for a given user.  Called on logout and on password change (which bumps the
-- session version) so that a user who signs out of a shared browser profile
-- stops receiving Web Push notifications on that device immediately.
-- @ActorUserId is normally the user themselves; it may be an admin user id for
-- a forced-logout, or 0 for a trusted internal caller.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AlertSubscription_DeactivateByUser
    @UserId      INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM auth.[User] WHERE UserId = @UserId)
        THROW 50004, N'VALIDATION:UserId does not exist', 1;

    BEGIN TRAN;

    -- Capture all active rows before retiring them (for the audit log).
    DECLARE @Retired TABLE (AlertSubscriptionId INT NOT NULL);

    UPDATE app.AlertSubscription
    SET IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    OUTPUT INSERTED.AlertSubscriptionId INTO @Retired
    WHERE UserId    = @UserId
      AND IsDeleted = 0;

    -- One audit row per retired subscription.
    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    SELECT
        @ActorUserId,
        N'DeactivateByUser',
        N'app.AlertSubscription',
        CAST(r.AlertSubscriptionId AS NVARCHAR(64)),
        (SELECT AlertSubscriptionId, UserId, EndpointHash, IsDeleted
         FROM app.AlertSubscription
         WHERE AlertSubscriptionId = r.AlertSubscriptionId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM @Retired AS r;

    COMMIT;
END;
GO
