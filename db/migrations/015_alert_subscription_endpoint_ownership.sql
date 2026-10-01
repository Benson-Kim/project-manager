-- 015_alert_subscription_endpoint_ownership.sql
-- Change the unique constraint on app.AlertSubscription so that each active
-- push endpoint can only belong to ONE user at a time.
--
-- The original index UQ_AlertSubscription_User_Endpoint enforced uniqueness on
-- (UserId, EndpointHash), which allowed two users to hold active rows for the
-- same endpoint (e.g. a shared browser profile).  The new index
-- UQ_AlertSubscription_Endpoint enforces uniqueness on EndpointHash alone,
-- so ownership transfers are the only way to register an already-active endpoint
-- under a different account.  usp_AlertSubscription_Upsert handles the transfer.
USE ProjectManager;
GO

-- Drop the old per-user index if it still exists.
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'app.AlertSubscription')
      AND name = N'UQ_AlertSubscription_User_Endpoint'
)
    DROP INDEX UQ_AlertSubscription_User_Endpoint ON app.AlertSubscription;
GO

-- Create the new endpoint-scoped unique index.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'app.AlertSubscription')
      AND name = N'UQ_AlertSubscription_Endpoint'
)
    CREATE UNIQUE INDEX UQ_AlertSubscription_Endpoint
        ON app.AlertSubscription (EndpointHash)
        WHERE IsDeleted = 0;
GO
