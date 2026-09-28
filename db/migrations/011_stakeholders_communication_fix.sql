-- 011_stakeholders_communication_fix.sql — correct CommunicationPreference CHECK constraint.
-- Migration 006 was applied with N'Meetings' (plural). The correct vocabulary value is
-- N'Meeting' (singular, matching requirement row 70 and the UI schema COMMUNICATION_PREFERENCES).
-- This migration: drops the old constraint, normalises any existing rows, and re-adds the
-- constraint with the correct vocabulary. Idempotent: each statement is guarded.
USE ProjectManager;
GO

-- Drop the old constraint (may be 'Meetings' or 'Meeting' depending on which environment
-- has already been partially patched).
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_Stakeholder_CommunicationPreference'
      AND parent_object_id = OBJECT_ID(N'app.Stakeholder')
)
    ALTER TABLE app.Stakeholder DROP CONSTRAINT CK_Stakeholder_CommunicationPreference;
GO

-- Normalise rows that used the old plural value.
UPDATE app.Stakeholder
SET CommunicationPreference = N'Meeting'
WHERE CommunicationPreference = N'Meetings';
GO

-- Re-add the constraint with the correct singular vocabulary.
ALTER TABLE app.Stakeholder ADD CONSTRAINT CK_Stakeholder_CommunicationPreference
    CHECK ([CommunicationPreference] IS NULL
           OR [CommunicationPreference] IN (N'Email', N'Phone', N'Meeting'));
GO
