-- 078_meeting_point_assumption.sql — a meeting's assumptions go into the assumptions register.
--   app.MeetingDiscussionPoint.AssumptionConstraintId links a discussion point to the register row
--   it was logged as. usp_MeetingDiscussionPoint_LogAssumption creates the row (Type 'Assumption')
--   and sets the link in one transaction, as 077 does for decisions.
--   A deleted register row leaves the link in place; the workspace read hides it, and logging the
--   point again creates a new row and moves the link.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.MeetingDiscussionPoint', N'AssumptionConstraintId') IS NULL
    ALTER TABLE app.MeetingDiscussionPoint ADD AssumptionConstraintId INT NULL
        CONSTRAINT FK_MeetingDiscussionPoint_AssumptionConstraint
        REFERENCES app.AssumptionConstraint (AssumptionConstraintId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = N'UX_MeetingDiscussionPoint_AssumptionConstraint'
                 AND object_id = OBJECT_ID(N'app.MeetingDiscussionPoint'))
    CREATE UNIQUE INDEX UX_MeetingDiscussionPoint_AssumptionConstraint
        ON app.MeetingDiscussionPoint (AssumptionConstraintId) WHERE AssumptionConstraintId IS NOT NULL;
GO
