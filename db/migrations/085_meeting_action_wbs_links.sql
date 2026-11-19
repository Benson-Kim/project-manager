-- 085_meeting_action_wbs_links.sql — a meeting action item can point at the WBS tasks it is about.
--   app.MeetingActionWbsLink holds one row per (action item, WBS item). usp_MeetingActionItem_SetWbsLinks keeps
--   both in one project; a Gantt task lists its action items and their meetings from these rows.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.MeetingActionWbsLink', N'U') IS NULL
    CREATE TABLE app.MeetingActionWbsLink (
        MeetingActionItemId INT       NOT NULL
            CONSTRAINT FK_MeetingActionWbsLink_ActionItem
            REFERENCES app.MeetingActionItem (MeetingActionItemId),
        KeyDeliverableId    INT       NOT NULL
            CONSTRAINT FK_MeetingActionWbsLink_KeyDeliverable
            REFERENCES app.KeyDeliverable (KeyDeliverableId),
        CreatedAtUtc        DATETIME2 NOT NULL CONSTRAINT DF_MeetingActionWbsLink_CreatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy           INT       NULL,
        CONSTRAINT PK_MeetingActionWbsLink PRIMARY KEY (MeetingActionItemId, KeyDeliverableId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MeetingActionWbsLink_KeyDeliverable'
               AND object_id = OBJECT_ID(N'app.MeetingActionWbsLink'))
    CREATE INDEX IX_MeetingActionWbsLink_KeyDeliverable
        ON app.MeetingActionWbsLink (KeyDeliverableId, MeetingActionItemId);
GO
