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

    DECLARE @OwnerUserId INT;
    SELECT @OwnerUserId = UserId FROM app.AlertSubscription
    WHERE AlertSubscriptionId = @AlertSubscriptionId AND IsDeleted = 0;
    IF @OwnerUserId IS NULL RETURN;

    -- Object-level authorization (ADR-0021): @ActorUserId = 0 is the trusted dispatch
    -- service, which retires an endpoint Web Push has rejected. A real user may retire
    -- only their own endpoint, so the "future UI" this proc was written for cannot
    -- silence another user's notifications by passing their subscription id.
    IF @ActorUserId <> 0 AND @ActorUserId <> @OwnerUserId
        THROW 50003, N'FORBIDDEN_ROW:Not your subscription', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT AlertSubscriptionId, UserId, EndpointHash, IsDeleted
         FROM app.AlertSubscription
         WHERE AlertSubscriptionId = @AlertSubscriptionId AND IsDeleted = 0
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

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
