-- usp_AlertSubscription_Deactivate — retire an expired/invalid push endpoint.
-- @ActorUserId = 0 is the trusted dispatch service; a real user id is used
-- when a user explicitly removes a subscription in a future UI.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AlertSubscription_Deactivate
    @AlertSubscriptionId INT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT AlertSubscriptionId, UserId, EndpointHash, IsDeleted
         FROM app.AlertSubscription
         WHERE AlertSubscriptionId = @AlertSubscriptionId AND IsDeleted = 0
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    IF @Before IS NULL RETURN;

    BEGIN TRAN;
    UPDATE app.AlertSubscription
    SET IsDeleted = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy = @ActorUserId,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy = @ActorUserId
    WHERE AlertSubscriptionId = @AlertSubscriptionId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Deactivate', N'app.AlertSubscription',
            CAST(@AlertSubscriptionId AS NVARCHAR(64)), @Before);
    COMMIT;
END;
GO
