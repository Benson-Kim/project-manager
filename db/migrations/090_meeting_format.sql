-- 090_meeting_format.sql — Meeting format (Hybrid / Online / Physical), meeting
-- link, and next-meeting link (HTML prototype meeting-minutes.html, details
-- section).
--   MeetingFormat: NULL (legacy / no format chosen yet), 'Hybrid', 'Online' or
--     'Physical'. The header form shows Location and/or MeetingLink accordingly:
--       Hybrid   → Location + MeetingLink
--       Online   → MeetingLink only
--       Physical → Location only
--       NULL     → Location only (backward compatible)
--   MeetingLink: the online meeting URL for this meeting.
--   NextMeetingLink: the online meeting URL for the next meeting.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.Meeting', N'MeetingFormat') IS NULL
    ALTER TABLE app.Meeting ADD MeetingFormat NVARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Meeting_MeetingFormat'
                 AND parent_object_id = OBJECT_ID(N'app.Meeting'))
    ALTER TABLE app.Meeting WITH CHECK
        ADD CONSTRAINT CK_Meeting_MeetingFormat CHECK (
            MeetingFormat IN (N'Hybrid', N'Online', N'Physical'));
GO

IF COL_LENGTH(N'app.Meeting', N'MeetingLink') IS NULL
    ALTER TABLE app.Meeting ADD MeetingLink NVARCHAR(500) NULL;
GO

IF COL_LENGTH(N'app.Meeting', N'NextMeetingLink') IS NULL
    ALTER TABLE app.Meeting ADD NextMeetingLink NVARCHAR(500) NULL;
GO
