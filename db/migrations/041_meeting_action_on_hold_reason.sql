-- 041_meeting_action_on_hold_reason.sql — why an action item is on hold (client feedback
-- 2026-10-23; ADR-0044).
--   app.MeetingActionItem.OnHoldReason NVARCHAR(500) NULL: free text the writer may supply when
--     they put an action on hold. Optional, because the client asked to be able to give a reason,
--     not to be made to.
--   CK_MeetingActionItem_OnHoldReason holds the invariant that the reason belongs to the hold:
--     a row may carry one only while its Status is 'on-hold'. Moving an action to in-progress or
--     completed clears it, so a reader never sees "why it is waiting" beside "it is done". The
--     reason is not lost by that: every SetStatus writes an audit row (audit.AuditLog) whose
--     BeforeJson carries the reason as it stood, so the history of a hold stays readable.
--     It is a TABLE-level constraint, not a column one, because it names a second column
--     (Status) — SQL Server raises error 8141 for that in a column CHECK, and only on apply
--     (src/tests/migration-check-constraints.test.ts).
--   No index: the column is read with the row it belongs to and is never filtered on.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.MeetingActionItem', N'OnHoldReason') IS NULL
    ALTER TABLE app.MeetingActionItem ADD [OnHoldReason] NVARCHAR(500) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                 WHERE name = N'CK_MeetingActionItem_OnHoldReason'
                   AND parent_object_id = OBJECT_ID(N'app.MeetingActionItem'))
    ALTER TABLE app.MeetingActionItem ADD CONSTRAINT CK_MeetingActionItem_OnHoldReason
        CHECK ([OnHoldReason] IS NULL OR [Status] = 'on-hold');
GO
