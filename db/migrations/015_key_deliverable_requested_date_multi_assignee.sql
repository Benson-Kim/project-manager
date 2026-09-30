-- 015_key_deliverable_requested_date_multi_assignee.sql
-- Adds RequestedDate to app.KeyDeliverable and creates
-- app.KeyDeliverableAssignee junction table (multi-assignee support).
-- The legacy AssignedToStakeholderId column is kept for backward
-- compatibility during the transition; procs now read from the junction
-- table exclusively.
-- Module: key-deliverables (#9).

-- Check guard
IF NOT EXISTS (
    SELECT 1 FROM app.SchemaMigrations WHERE MigrationId = '015'
)
BEGIN

    -- 1. Add RequestedDate column (nullable; date-only input, stored as midnight UTC)
    IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'app.KeyDeliverable')
          AND name = N'RequestedDate'
    )
    BEGIN
        ALTER TABLE app.KeyDeliverable
            ADD [RequestedDate] DATETIME2 NULL;
    END;

    -- 2. Create junction table app.KeyDeliverableAssignee
    IF OBJECT_ID(N'app.KeyDeliverableAssignee', N'U') IS NULL
    BEGIN
        CREATE TABLE app.KeyDeliverableAssignee (
            KeyDeliverableId INT NOT NULL
                CONSTRAINT FK_KDA_KeyDeliverable
                REFERENCES app.KeyDeliverable (KeyDeliverableId),
            StakeholderId    INT NOT NULL
                CONSTRAINT FK_KDA_Stakeholder
                REFERENCES app.Stakeholder (StakeholderId),
            CreatedAtUtc     DATETIME2 NOT NULL
                CONSTRAINT DF_KDA_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
            CreatedBy        INT NOT NULL,
            CONSTRAINT PK_KeyDeliverableAssignee
                PRIMARY KEY (KeyDeliverableId, StakeholderId)
        );
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_KDA_StakeholderId'
          AND object_id = OBJECT_ID(N'app.KeyDeliverableAssignee')
    )
        CREATE INDEX IX_KDA_StakeholderId
            ON app.KeyDeliverableAssignee (StakeholderId);

    INSERT INTO app.SchemaMigrations (MigrationId, AppliedAtUtc)
    VALUES ('015', SYSUTCDATETIME());

END;
GO
