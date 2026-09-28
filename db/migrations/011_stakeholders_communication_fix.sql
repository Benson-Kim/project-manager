-- 011_stakeholders_communication_fix.sql — correct CommunicationPreference CHECK constraint.
-- Migration 006 was applied to all existing environments with N'Meetings' (plural).
-- The correct vocabulary value is N'Meeting' (singular), matching requirement row 70
-- and the UI schema COMMUNICATION_PREFERENCES constant.
-- Fix-forward pattern: drop old constraint → normalise existing rows → re-add with correct value.
-- Idempotent: DROP is guarded by IF EXISTS; UPDATE is a no-op when rows are already correct.
USE ProjectManager;
GO

-- Drop whatever version of the constraint currently exists (either the original 'Meetings'
-- or a partially-patched 'Meeting').
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_Stakeholder_CommunicationPreference'
      AND parent_object_id = OBJECT_ID(N'app.Stakeholder')
)
    ALTER TABLE app.Stakeholder DROP CONSTRAINT CK_Stakeholder_CommunicationPreference;
GO

-- Normalise any rows that were saved with the old plural value.
UPDATE app.Stakeholder
SET CommunicationPreference = N'Meeting'
WHERE CommunicationPreference = N'Meetings';
GO

-- Re-add the constraint with the correct singular vocabulary.
ALTER TABLE app.Stakeholder ADD CONSTRAINT CK_Stakeholder_CommunicationPreference
    CHECK ([CommunicationPreference] IS NULL
           OR [CommunicationPreference] IN (N'Email', N'Phone', N'Meeting'));
GO
