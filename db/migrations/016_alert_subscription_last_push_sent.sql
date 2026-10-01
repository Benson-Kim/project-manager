-- 016_alert_subscription_last_push_sent.sql
-- Add LastPushSentAtUtc to app.AlertSubscription so the delivery proc can
-- skip subscriptions that already received a push in the current UTC day.
-- This prevents a fixed TOP(n) batch from permanently starving later rows:
-- after a row is stamped it falls out of the "due and not yet sent today"
-- window until the following day's dispatch run.
USE ProjectManager;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'app.AlertSubscription')
      AND name = N'LastPushSentAtUtc'
)
    ALTER TABLE app.AlertSubscription
        ADD LastPushSentAtUtc DATETIME2 NULL;
GO

-- Sparse index: only subscriptions that have been sent at least once have a
-- non-NULL LastPushSentAtUtc, so a filtered index keeps the scan tight.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'app.AlertSubscription')
      AND name = N'IX_AlertSubscription_LastPushSentAtUtc'
)
    CREATE INDEX IX_AlertSubscription_LastPushSentAtUtc
        ON app.AlertSubscription (LastPushSentAtUtc)
        WHERE IsDeleted = 0 AND LastPushSentAtUtc IS NOT NULL;
GO
