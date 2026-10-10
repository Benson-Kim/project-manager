-- 014_alert_subscriptions.sql — per-user Web Push subscriptions.
-- Subscriptions are browser credentials, not todo data; endpointHash keeps the
-- long endpoint out of the unique-index key-size limit.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.AlertSubscription', N'U') IS NULL
BEGIN
    CREATE TABLE app.AlertSubscription (
        AlertSubscriptionId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AlertSubscription PRIMARY KEY,
        UserId              INT NOT NULL CONSTRAINT FK_AlertSubscription_User_UserId REFERENCES auth.[User] (UserId),
        Endpoint            NVARCHAR(2048) NOT NULL,
        EndpointHash        VARBINARY(32) NOT NULL,
        P256dh              NVARCHAR(255) NOT NULL,
        Auth                NVARCHAR(255) NOT NULL,
        ExpirationTimeUtc   DATETIME2 NULL,
        IsDeleted           BIT NOT NULL CONSTRAINT DF_AlertSubscription_IsDeleted DEFAULT 0,
        DeletedAtUtc        DATETIME2 NULL,
        DeletedBy           INT NULL,
        CreatedAtUtc        DATETIME2 NOT NULL CONSTRAINT DF_AlertSubscription_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy           INT NOT NULL,
        UpdatedAtUtc        DATETIME2 NULL,
        UpdatedBy           INT NULL,
        RowVer              ROWVERSION
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'app.AlertSubscription')
      AND name = N'UQ_AlertSubscription_User_Endpoint'
)
    CREATE UNIQUE INDEX UQ_AlertSubscription_User_Endpoint
        ON app.AlertSubscription (UserId, EndpointHash)
        WHERE IsDeleted = 0;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'app.AlertSubscription')
      AND name = N'IX_AlertSubscription_Dispatch'
)
    CREATE INDEX IX_AlertSubscription_Dispatch
        ON app.AlertSubscription (IsDeleted, UserId)
        INCLUDE (Endpoint, EndpointHash, P256dh, Auth, ExpirationTimeUtc);
GO
