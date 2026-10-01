-- usp_AlertSubscription_Upsert — register or refresh one browser push subscription.
-- The endpoint and browser keys are validated in the route and persisted here
-- under the authenticated @ActorUserId.
--
-- Endpoint ownership is exclusive: each physical browser endpoint can only
-- belong to one user at a time.  If the same endpoint was previously registered
-- by a DIFFERENT user (e.g. a shared browser profile), that prior row is retired
-- before the new one is created.  This prevents the dispatch service from sending
-- another user's to-do titles to the wrong person, and ensures a user who signs
-- out and then in as someone else does not continue receiving notifications for
-- the first account.
--
-- Re-registering the same endpoint by the SAME user is idempotent and
-- reactivates a previously retired row.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AlertSubscription_Upsert
    @Endpoint          NVARCHAR(2048),
    @P256dh            NVARCHAR(255),
    @Auth              NVARCHAR(255),
    @ExpirationTimeUtc DATETIME2 = NULL,
    @ActorUserId       INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Endpoint IS NULL OR LTRIM(RTRIM(@Endpoint)) = N''
        THROW 50004, N'VALIDATION:Endpoint is required', 1;
    IF @P256dh IS NULL OR LTRIM(RTRIM(@P256dh)) = N''
        THROW 50004, N'VALIDATION:P256dh key is required', 1;
    IF @Auth IS NULL OR LTRIM(RTRIM(@Auth)) = N''
        THROW 50004, N'VALIDATION:Auth key is required', 1;
    IF NOT EXISTS (SELECT 1 FROM auth.[User] WHERE UserId = @ActorUserId AND IsDeleted = 0 AND IsActive = 1)
        THROW 50003, N'FORBIDDEN_ROW:User is not active', 1;

    DECLARE @EndpointHash VARBINARY(32) = HASHBYTES(N'SHA2_256', @Endpoint);
    DECLARE @Id             INT;
    DECLARE @ExistingUserId INT;
    DECLARE @Before         NVARCHAR(MAX) = NULL;

    BEGIN TRAN;

    -- Locate any active row for this endpoint, regardless of which user owns it.
    -- Capture UserId here so we can decide on ownership without a second round-trip.
    SELECT TOP (1)
        @Id             = s.AlertSubscriptionId,
        @ExistingUserId = s.UserId,
        @Before = (SELECT beforeRow.AlertSubscriptionId, beforeRow.UserId, beforeRow.EndpointHash,
                          beforeRow.P256dh, beforeRow.Auth, beforeRow.ExpirationTimeUtc, beforeRow.IsDeleted
                   FROM app.AlertSubscription AS beforeRow
                   WHERE beforeRow.AlertSubscriptionId = s.AlertSubscriptionId
                   FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM app.AlertSubscription AS s WITH (UPDLOCK, HOLDLOCK)
    WHERE s.EndpointHash = @EndpointHash
      AND s.IsDeleted = 0;

    IF @Id IS NULL
    BEGIN
        -- No existing active row for this endpoint — create a fresh one.
        INSERT INTO app.AlertSubscription
            (UserId, Endpoint, EndpointHash, P256dh, Auth, ExpirationTimeUtc, CreatedBy)
        VALUES
            (@ActorUserId, @Endpoint, @EndpointHash, @P256dh, @Auth, @ExpirationTimeUtc, @ActorUserId);
        SET @Id = CONVERT(INT, SCOPE_IDENTITY());
    END
    ELSE
    BEGIN
        -- Row exists.  Check whether it belongs to the current user or to
        -- a different user (shared browser profile scenario).
        -- @ExistingUserId was captured in the locked SELECT above.
        IF @ExistingUserId <> @ActorUserId
        BEGIN
            -- Transfer ownership: retire the old user's row and insert a new
            -- one for the current user so the previous account stops receiving
            -- push messages on this device.
            UPDATE app.AlertSubscription
            SET IsDeleted      = 1,
                DeletedAtUtc   = SYSUTCDATETIME(),
                DeletedBy      = @ActorUserId,
                UpdatedAtUtc   = SYSUTCDATETIME(),
                UpdatedBy      = @ActorUserId
            WHERE AlertSubscriptionId = @Id;

            -- Audit the retirement of the previous user's subscription.
            INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
            VALUES (
                @ActorUserId,
                N'TransferOwnership',
                N'app.AlertSubscription',
                CAST(@Id AS NVARCHAR(64)),
                @Before,
                (SELECT AlertSubscriptionId, UserId, EndpointHash, P256dh, Auth, ExpirationTimeUtc, IsDeleted
                 FROM app.AlertSubscription WHERE AlertSubscriptionId = @Id
                 FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
            );

            -- Insert a fresh row for the current user.
            INSERT INTO app.AlertSubscription
                (UserId, Endpoint, EndpointHash, P256dh, Auth, ExpirationTimeUtc, CreatedBy)
            VALUES
                (@ActorUserId, @Endpoint, @EndpointHash, @P256dh, @Auth, @ExpirationTimeUtc, @ActorUserId);
            SET @Id = CONVERT(INT, SCOPE_IDENTITY());

            -- Reset @Before for the audit below so it reflects the new row.
            SET @Before = NULL;
        END
        ELSE
        BEGIN
            -- Same user: idempotent refresh (reactivates if it was soft-deleted
            -- since the lock was taken, updates keys/expiry).
            UPDATE app.AlertSubscription
            SET Endpoint           = @Endpoint,
                P256dh             = @P256dh,
                Auth               = @Auth,
                ExpirationTimeUtc  = @ExpirationTimeUtc,
                IsDeleted          = 0,
                DeletedAtUtc       = NULL,
                DeletedBy          = NULL,
                UpdatedAtUtc       = SYSUTCDATETIME(),
                UpdatedBy          = @ActorUserId
            WHERE AlertSubscriptionId = @Id;
        END;
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (
        @ActorUserId,
        N'Upsert',
        N'app.AlertSubscription',
        CAST(@Id AS NVARCHAR(64)),
        @Before,
        (SELECT AlertSubscriptionId, UserId, EndpointHash, P256dh, Auth, ExpirationTimeUtc, IsDeleted
         FROM app.AlertSubscription WHERE AlertSubscriptionId = @Id
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    );

    COMMIT;

    SELECT AlertSubscriptionId, UserId, Endpoint, P256dh, Auth, ExpirationTimeUtc,
           CreatedAtUtc, UpdatedAtUtc, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.AlertSubscription
    WHERE AlertSubscriptionId = @Id AND IsDeleted = 0;
END;
GO
