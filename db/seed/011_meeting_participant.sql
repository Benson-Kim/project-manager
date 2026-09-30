-- Seed app.MeetingParticipant — ALL rows from docs/source/analysis/access-database.md §4 (tblMeetingParticipants).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
-- Surrogate ids 1-8 in source row order; Meeting ID 0 (never existed) → NULL; Apology → IsApology.
USE ProjectManager;
GO
SET IDENTITY_INSERT app.MeetingParticipant ON;

INSERT INTO app.MeetingParticipant ([MeetingParticipantId], [MeetingId], [StakeholderId], [IsApology], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, NULL, 1, 0, 0),
    (2, 1, 1, 0, 0),
    (3, NULL, 2, 1, 0),
    (4, 1, 2, 0, 0),
    (5, 1, 3, 1, 0),
    (6, 2, 4, 0, 0),
    (7, 2, 5, 1, 0),
    (8, 2, 6, 0, 0)
) AS s ([MeetingParticipantId], [MeetingId], [StakeholderId], [IsApology], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.MeetingParticipant t WHERE t.[MeetingParticipantId] = s.[MeetingParticipantId]);

SET IDENTITY_INSERT app.MeetingParticipant OFF;
GO
