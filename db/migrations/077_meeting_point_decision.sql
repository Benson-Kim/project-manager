-- 077_meeting_point_decision.sql — a meeting's decisions go into the decision log.
--   app.MeetingDiscussionPoint.DecisionId links a discussion point to the decision it was logged
--   as. usp_MeetingDiscussionPoint_LogDecision creates the app.Decision row and sets the link in
--   one transaction, so a logged point and its decision can never part.
--   The unique index is filtered: most points are not decisions, and one decision is logged from
--   one point only. The proc holds both ends inside one project; the point has no ProjectId of its
--   own to carry a composite foreign key.
--   A deleted decision leaves the link in place; the workspace read hides it, and logging the
--   point again creates a new decision and moves the link.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.MeetingDiscussionPoint', N'DecisionId') IS NULL
    ALTER TABLE app.MeetingDiscussionPoint ADD DecisionId INT NULL
        CONSTRAINT FK_MeetingDiscussionPoint_Decision REFERENCES app.Decision (DecisionId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = N'UX_MeetingDiscussionPoint_Decision'
                 AND object_id = OBJECT_ID(N'app.MeetingDiscussionPoint'))
    CREATE UNIQUE INDEX UX_MeetingDiscussionPoint_Decision
        ON app.MeetingDiscussionPoint (DecisionId) WHERE DecisionId IS NOT NULL;
GO
