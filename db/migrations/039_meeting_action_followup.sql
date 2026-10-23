-- 039_meeting_action_followup.sql — an action item's status and its follow-ups (client feedback
-- 2026-10-23; ADR-0041).
--   app.MeetingActionItem.Status: 'on-hold' | 'in-progress' | 'completed'. A closed set, because
--     'completed' is what stops an action carrying into later meetings — an admin-editable list
--     would let someone rename the value the carry-over rule reads. Existing rows become
--     'in-progress', which is what they were: every action counted as open before this migration.
--   app.MeetingActionFollowUp: the one-to-many under an action item. Each row is one follow-up,
--     with the person it is assigned to, the date it was made and the date it is due. The action
--     item keeps the single authoritative Status; a follow-up does not carry one of its own, so
--     there is one place to look for whether the action is done.
--   AssignedToStakeholderId has no FK to app.Stakeholder on purpose: the write procs check the
--     stakeholder is live and in the meeting's project under a lock, and an action's person
--     responsible already survives that stakeholder being deleted later (usp_MeetingActionItem_Update).
--     A FK would be a second, weaker rule that also blocks the delete.
--   IX_MeetingActionItem_OpenByMeeting backs the carry-over read in usp_Meeting_GetWorkspace,
--     which asks a project's other meetings for their unfinished actions.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.MeetingActionItem', N'Status') IS NULL
    ALTER TABLE app.MeetingActionItem ADD [Status] VARCHAR(12) NOT NULL
        CONSTRAINT DF_MeetingActionItem_Status DEFAULT 'in-progress'
        CONSTRAINT CK_MeetingActionItem_Status
            CHECK ([Status] IN ('on-hold', 'in-progress', 'completed'));
GO

-- The unfinished actions of a meeting, for the carry-over read. Filtered on IsDeleted so the
-- index holds only rows the read can return.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MeetingActionItem_OpenByMeeting'
                 AND object_id = OBJECT_ID(N'app.MeetingActionItem'))
    CREATE INDEX IX_MeetingActionItem_OpenByMeeting
        ON app.MeetingActionItem (MeetingId, [Status])
        INCLUDE (SortOrder, [AssignedToStakeholderId], [DueDate])
        WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.MeetingActionFollowUp', N'U') IS NULL
BEGIN
    CREATE TABLE app.MeetingActionFollowUp (
        MeetingActionFollowUpId  INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_MeetingActionFollowUp PRIMARY KEY,
        MeetingActionItemId      INT NOT NULL
            CONSTRAINT FK_MeetingActionFollowUp_MeetingActionItem
                REFERENCES app.MeetingActionItem (MeetingActionItemId),
        [FollowUp]               NVARCHAR(MAX) NULL,
        [AssignedToStakeholderId] INT NULL,
        -- The date the follow-up was made, and the date it is due.
        [FollowUpDate]           DATE NULL,
        [DueDate]                DATE NULL,
        SortOrder                INT NOT NULL
            CONSTRAINT DF_MeetingActionFollowUp_SortOrder DEFAULT 0,
        IsDeleted                BIT NOT NULL
            CONSTRAINT DF_MeetingActionFollowUp_IsDeleted DEFAULT 0,
        DeletedAtUtc             DATETIME2 NULL,
        DeletedBy                INT NULL,
        CreatedAtUtc             DATETIME2 NOT NULL
            CONSTRAINT DF_MeetingActionFollowUp_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy                INT NOT NULL,
        UpdatedAtUtc             DATETIME2 NULL,
        UpdatedBy                INT NULL,
        RowVer                   ROWVERSION
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MeetingActionFollowUp_ActionItem'
                 AND object_id = OBJECT_ID(N'app.MeetingActionFollowUp'))
    CREATE INDEX IX_MeetingActionFollowUp_ActionItem
        ON app.MeetingActionFollowUp (MeetingActionItemId, IsDeleted, SortOrder);
GO
