-- usp_AlertSubscription_Upsert — register or refresh one browser push subscription.
-- The endpoint and browser keys are validated in the route and persisted here
-- under the authenticated @ActorUserId. Re-registering the same endpoint is
-- idempotent and reactivates a previously retired row.
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
    DECLARE @Id INT;
    DECLARE @Before NVARCHAR(MAX) = NULL;

    BEGIN TRAN;

    SELECT TOP (1)
        @Id = AlertSubscriptionId,
        @Before = (SELECT AlertSubscriptionId, UserId, EndpointHash, P256dh, Auth, ExpirationTimeUtc, IsDeleted
                   FROM app.AlertSubscription AS beforeRow
                   WHERE beforeRow.AlertSubscriptionId = s.AlertSubscriptionId
                   FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM app.AlertSubscription AS s WITH (UPDLOCK, HOLDLOCK)
    WHERE s.UserId = @ActorUserId AND s.EndpointHash = @EndpointHash;

    IF @Id IS NULL
    BEGIN
        INSERT INTO app.AlertSubscription
            (UserId, Endpoint, EndpointHash, P256dh, Auth, ExpirationTimeUtc, CreatedBy)
        VALUES
            (@ActorUserId, @Endpoint, @EndpointHash, @P256dh, @Auth, @ExpirationTimeUtc, @ActorUserId);
        SET @Id = CONVERT(INT, SCOPE_IDENTITY());
    END
    ELSE
    BEGIN
        UPDATE app.AlertSubscription
        SET Endpoint = @Endpoint,
            P256dh = @P256dh,
            Auth = @Auth,
            ExpirationTimeUtc = @ExpirationTimeUtc,
            IsDeleted = 0,
            DeletedAtUtc = NULL,
            DeletedBy = NULL,
            UpdatedAtUtc = SYSUTCDATETIME(),
            UpdatedBy = @ActorUserId
        WHERE AlertSubscriptionId = @Id;
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
