-- 024_meeting_minutes.sql — meetings and their minutes (module #10, checklist rows 12, 13, 53, 54,
-- 72; ADR-0028).
--   Meeting.DateReceived, Meeting.Objective: row 54 ("Date received", "Objective": the reason for
--     the meeting). Objective is rich text (ADR-0025), sanitised by the app before the procs store it.
--   SortOrder on agenda items, discussion points and action items: position among siblings, from 1.
--   MeetingActionItem.MeetingId: the meeting an action belongs to, derived by the procs from its
--     discussion point or agenda item, so an action can never point at another meeting's rows.
--   UX_MeetingParticipant_Meeting_Stakeholder: a stakeholder is listed once per meeting. Live
--     duplicates (none in the Access data) are soft-deleted first, keeping the lowest id.
--   Backfill (SortOrder, MeetingId): seed 032, which runs after the migrations both on an upgrade
--     and on a new database (after the meeting seeds), so one script covers every row.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.Meeting', N'DateReceived') IS NULL
    ALTER TABLE app.Meeting ADD DateReceived DATE NULL;
GO

IF COL_LENGTH(N'app.Meeting', N'Objective') IS NULL
    ALTER TABLE app.Meeting ADD Objective NVARCHAR(MAX) NULL;
GO

IF COL_LENGTH(N'app.MeetingAgendaItem', N'SortOrder') IS NULL
    ALTER TABLE app.MeetingAgendaItem ADD SortOrder INT NOT NULL
        CONSTRAINT DF_MeetingAgendaItem_SortOrder DEFAULT 0;
GO

IF COL_LENGTH(N'app.MeetingDiscussionPoint', N'SortOrder') IS NULL
    ALTER TABLE app.MeetingDiscussionPoint ADD SortOrder INT NOT NULL
        CONSTRAINT DF_MeetingDiscussionPoint_SortOrder DEFAULT 0;
GO

IF COL_LENGTH(N'app.MeetingActionItem', N'SortOrder') IS NULL
    ALTER TABLE app.MeetingActionItem ADD SortOrder INT NOT NULL
        CONSTRAINT DF_MeetingActionItem_SortOrder DEFAULT 0;
GO

IF COL_LENGTH(N'app.MeetingActionItem', N'MeetingId') IS NULL
    ALTER TABLE app.MeetingActionItem ADD MeetingId INT NULL
        CONSTRAINT FK_MeetingActionItem_Meeting_MeetingId REFERENCES app.Meeting (MeetingId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MeetingActionItem_MeetingId'
                 AND object_id = OBJECT_ID(N'app.MeetingActionItem'))
    CREATE INDEX IX_MeetingActionItem_MeetingId
        ON app.MeetingActionItem (MeetingId, IsDeleted, SortOrder);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Meeting_Project_StartDate'
                 AND object_id = OBJECT_ID(N'app.Meeting'))
    CREATE INDEX IX_Meeting_Project_StartDate
        ON app.Meeting (ProjectId, IsDeleted, StartDate DESC)
        INCLUDE ([Subject], [Location]);
GO

WITH dupes AS (
    SELECT IsDeleted, DeletedAtUtc, DeletedBy,
           ROW_NUMBER() OVER (PARTITION BY MeetingId, StakeholderId
                              ORDER BY MeetingParticipantId) AS Rn
    FROM app.MeetingParticipant
    WHERE IsDeleted = 0 AND MeetingId IS NOT NULL
)
UPDATE dupes SET IsDeleted = 1, DeletedAtUtc = SYSUTCDATETIME(), DeletedBy = 0
WHERE Rn > 1;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_MeetingParticipant_Meeting_Stakeholder'
                 AND object_id = OBJECT_ID(N'app.MeetingParticipant'))
    CREATE UNIQUE INDEX UX_MeetingParticipant_Meeting_Stakeholder
        ON app.MeetingParticipant (MeetingId, StakeholderId)
        WHERE IsDeleted = 0 AND MeetingId IS NOT NULL;
GO
