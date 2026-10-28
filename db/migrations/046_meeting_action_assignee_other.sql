-- 046_meeting_action_assignee_other.sql — a person responsible who is not a stakeholder
-- (client feedback 2026-10-26; ADR-0047 decision 2).
--   app.MeetingActionItem.AssigneeOther NVARCHAR(255) NULL: the client asked for the drop-down to
--     "allow for a person to write the name in case it is someone not present and potentially out
--     of the organization". A guest or an outside supplier has no Stakeholder row and should not
--     get one — a stakeholder is a project relationship, not a free-text label — so the typed name
--     lives beside the foreign key rather than inventing a row to point at.
--     app.QuestionAnswer.AssignedTo is the same shape, already in the schema.
--   CK_MeetingActionItem_OneAssignee: at most one of the two is set. "Responsible" is one person,
--     so a row carrying both a stakeholder and a typed name has no answer to "who?", and
--     usp_Meeting_GetWorkspace's COALESCE would silently pick the stakeholder and hide the other.
--     Enforced here rather than in the form, because the form is not the only writer.
--     Existing rows all have AssigneeOther NULL, so the constraint cannot fail on apply.
--     It is a TABLE-level constraint: a column CHECK naming a second column raises error 8141 on
--     apply (src/tests/migration-check-constraints.test.ts, and migration 043's note).
--   No index: AssigneeOther is read with the row it belongs to and is never filtered or joined on.
--     IX_MeetingActionItem_AssignedToStakeholderId still covers the stakeholder side.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.MeetingActionItem', N'AssigneeOther') IS NULL
    ALTER TABLE app.MeetingActionItem ADD [AssigneeOther] NVARCHAR(255) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                 WHERE name = N'CK_MeetingActionItem_OneAssignee'
                   AND parent_object_id = OBJECT_ID(N'app.MeetingActionItem'))
    ALTER TABLE app.MeetingActionItem ADD CONSTRAINT CK_MeetingActionItem_OneAssignee
        CHECK ([AssignedToStakeholderId] IS NULL OR [AssigneeOther] IS NULL);
GO
