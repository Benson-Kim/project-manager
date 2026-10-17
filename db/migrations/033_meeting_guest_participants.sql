-- 033_meeting_guest_participants.sql — a meeting participant can be a guest: someone who attended
-- (or sent apologies) without being a stakeholder of the project (client note 2026-10-17; ADR-0028
-- amendment of the same day).
--   StakeholderId: NULL for a guest. GuestName (required for a guest) and GuestOrganization name
--     the guest instead; a stakeholder row keeps both NULL. CK_MeetingParticipant_Person: exactly
--     one identity per row.
--   UX_MeetingParticipant_Meeting_Stakeholder: stakeholder rows only from now on (NULLs count as
--     equal in a unique index). UX_MeetingParticipant_Meeting_Guest: one live row per guest name per
--     meeting; the name is the guest's identity for usp_MeetingParticipant_Set (database collation:
--     case-insensitive, accent-sensitive).
-- Idempotent: safe to re-run.
USE ProjectManager;
GO
IF COL_LENGTH(N'app.MeetingParticipant', N'GuestName') IS NULL
    ALTER TABLE app.MeetingParticipant
        ADD GuestName         NVARCHAR(255) NULL,
            GuestOrganization NVARCHAR(255) NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID(N'app.MeetingParticipant') AND name = N'StakeholderId' AND is_nullable = 0)
    ALTER TABLE app.MeetingParticipant ALTER COLUMN StakeholderId INT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.indexes
           WHERE name = N'UX_MeetingParticipant_Meeting_Stakeholder'
             AND object_id = OBJECT_ID(N'app.MeetingParticipant')
             AND filter_definition NOT LIKE N'%StakeholderId%')
    DROP INDEX UX_MeetingParticipant_Meeting_Stakeholder ON app.MeetingParticipant;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_MeetingParticipant_Meeting_Stakeholder'
                 AND object_id = OBJECT_ID(N'app.MeetingParticipant'))
    CREATE UNIQUE INDEX UX_MeetingParticipant_Meeting_Stakeholder
        ON app.MeetingParticipant (MeetingId, StakeholderId)
        WHERE IsDeleted = 0 AND MeetingId IS NOT NULL AND StakeholderId IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_MeetingParticipant_Meeting_Guest'
                 AND object_id = OBJECT_ID(N'app.MeetingParticipant'))
    CREATE UNIQUE INDEX UX_MeetingParticipant_Meeting_Guest
        ON app.MeetingParticipant (MeetingId, GuestName)
        WHERE IsDeleted = 0 AND MeetingId IS NOT NULL AND GuestName IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_MeetingParticipant_Person'
                 AND parent_object_id = OBJECT_ID(N'app.MeetingParticipant'))
    ALTER TABLE app.MeetingParticipant WITH CHECK
        ADD CONSTRAINT CK_MeetingParticipant_Person CHECK (
            (StakeholderId IS NOT NULL AND GuestName IS NULL AND GuestOrganization IS NULL)
            OR (StakeholderId IS NULL AND GuestName IS NOT NULL AND LEN(GuestName) > 0));
GO
