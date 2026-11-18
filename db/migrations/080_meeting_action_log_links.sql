-- 080_meeting_action_log_links.sql — a meeting action item can be logged in any number of governance logs.
--   app.MeetingActionLogLink holds one row per (action item, log): LogKind names the log, RecordId the row in that
--   log's table. One action item has at most one record per log, and one record comes from one action item only.
--   RecordId has no foreign key because it points into five tables; usp_MeetingActionItem_SetLogLinks keeps the
--   action item and the record in one project, and reads hide deleted records.
--   SyncedRowVer is the record's RowVer when the minutes last wrote it. A record whose RowVer has moved on since was
--   edited in its log, and the minutes no longer overwrite it.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.MeetingActionLogLink', N'U') IS NULL
    CREATE TABLE app.MeetingActionLogLink (
        MeetingActionItemId INT          NOT NULL
            CONSTRAINT FK_MeetingActionLogLink_ActionItem
            REFERENCES app.MeetingActionItem (MeetingActionItemId),
        LogKind             NVARCHAR(32) NOT NULL
            CONSTRAINT CK_MeetingActionLogLink_Kind
            CHECK (LogKind IN (N'Decision', N'AssumptionConstraint', N'RiskIssue', N'QuestionAnswer', N'ParkingLotItem')),
        RecordId            INT          NOT NULL,
        SyncedRowVer        BIGINT       NULL,
        CreatedAtUtc        DATETIME2    NOT NULL CONSTRAINT DF_MeetingActionLogLink_CreatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy           INT          NULL,
        CONSTRAINT PK_MeetingActionLogLink PRIMARY KEY (MeetingActionItemId, LogKind),
        CONSTRAINT UQ_MeetingActionLogLink_Record UNIQUE (LogKind, RecordId)
    );
GO
