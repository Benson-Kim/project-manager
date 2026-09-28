-- 006_stakeholders_refinements.sql — stakeholders module (#6).
-- Dropdown vocabularies (requirements row 70) as CHECK constraints (decision
-- recorded in MR: fixed short lists, no admin editing required, so CHECK over
-- lookup tables; the UI vocabulary lives in stakeholder-form.ts).
-- Idempotent: constraints added only when absent. Seed rows comply
-- (CommunicationPreference N'Email', EngagementLevel N'Medium').
-- NOTE: CommunicationPreference intentionally uses N'Meetings' (plural) here —
-- this matches the state that was applied to all existing environments.
-- Migration 011 corrects the vocabulary to N'Meeting' (singular) going forward.
USE ProjectManager;
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_Stakeholder_CommunicationPreference'
      AND parent_object_id = OBJECT_ID(N'app.Stakeholder')
)
    ALTER TABLE app.Stakeholder ADD CONSTRAINT CK_Stakeholder_CommunicationPreference
        CHECK ([CommunicationPreference] IS NULL
               OR [CommunicationPreference] IN (N'Email', N'Phone', N'Meetings'));
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_Stakeholder_EngagementLevel'
      AND parent_object_id = OBJECT_ID(N'app.Stakeholder')
)
    ALTER TABLE app.Stakeholder ADD CONSTRAINT CK_Stakeholder_EngagementLevel
        CHECK ([EngagementLevel] IS NULL
               OR [EngagementLevel] IN (N'High', N'Medium', N'Low'));
GO
