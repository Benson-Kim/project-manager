-- 011_stakeholders_communication_fix.sql — re-add the CommunicationPreference CHECK
-- constraint using the correct plural vocabulary N'Meetings'.
--
-- Migration 006 added the constraint with N'Meetings' (plural). The source analysis,
-- COMMUNICATION_PREFERENCES schema constant, and all existing data use N'Meetings'.
-- This migration idempotently ensures the constraint exists with the plural value
-- (C11-9 fix: the original incorrect version converted rows to 'Meeting' singular and
-- re-added the constraint with the singular value, causing Zod parsing failures).
-- Idempotent: DROP is guarded by IF EXISTS; re-add is idempotent (CREATE OR ALTER not
-- available for CHECK — we drop first).
USE ProjectManager;
GO

-- Drop whatever version of the constraint currently exists so we can re-add cleanly.
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_Stakeholder_CommunicationPreference'
      AND parent_object_id = OBJECT_ID(N'app.Stakeholder')
)
    ALTER TABLE app.Stakeholder DROP CONSTRAINT CK_Stakeholder_CommunicationPreference;
GO

-- Re-add the constraint with the correct plural vocabulary (matching source + schema).
-- Any rows stored with N'Meeting' (singular) from the old incorrect migration are
-- tolerated as free-text NVARCHAR so they continue to pass Zod (which only validates
-- new form submissions against the enum; existing rows are passed through as-is).
ALTER TABLE app.Stakeholder ADD CONSTRAINT CK_Stakeholder_CommunicationPreference
    CHECK ([CommunicationPreference] IS NULL
           OR [CommunicationPreference] IN (N'Email', N'Phone', N'Meetings'));
GO
