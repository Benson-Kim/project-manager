-- 088_todo_alert_delivery.sql
-- One row per push delivered for an alert to a subscription on a local calendar day, so an
-- alert due later the same day is not suppressed by an earlier push, and recording a delivery
-- twice leaves one row.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.TodoAlertDelivery', N'U') IS NULL
BEGIN
    CREATE TABLE app.TodoAlertDelivery (
        TodoAlertId         INT       NOT NULL CONSTRAINT FK_TodoAlertDelivery_TodoAlert REFERENCES app.TodoAlert (TodoAlertId),
        AlertSubscriptionId INT       NOT NULL CONSTRAINT FK_TodoAlertDelivery_AlertSubscription REFERENCES app.AlertSubscription (AlertSubscriptionId),
        AlertDate           DATE      NOT NULL,
        SentAtUtc           DATETIME2 NOT NULL CONSTRAINT DF_TodoAlertDelivery_SentAtUtc DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_TodoAlertDelivery PRIMARY KEY (TodoAlertId, AlertSubscriptionId, AlertDate)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'app.TodoAlertDelivery')
      AND name = N'IX_TodoAlertDelivery_AlertSubscriptionId'
)
    CREATE INDEX IX_TodoAlertDelivery_AlertSubscriptionId
        ON app.TodoAlertDelivery (AlertSubscriptionId, AlertDate);
GO
