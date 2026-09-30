-- Seed app.Note — ALL rows from docs/source/analysis/access-database.md §4 (tblNotes).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.Note ON;

INSERT INTO app.Note ([NoteId], [ProjectId], [Title], [Content], [CreatedBy])
SELECT s.*
FROM (VALUES
    (7, 2, N'New Notes', N'I have some notes here', 0),
    (8, 2, N'Note 6', N'New changes made here', 0),
    (9, 2, N'Note 7', N'Made changes', 0),
    (10, 2, N'Note 8', NULL, 0),
    (11, 2, NULL, N'I have some notes here', 0),
    (12, 1, NULL, N'I have some notes here', 0),
    (13, 1, N'ProjectsNote', NULL, 0)
) AS s ([NoteId], [ProjectId], [Title], [Content], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.Note t WHERE t.[NoteId] = s.[NoteId]);

SET IDENTITY_INSERT app.Note OFF;
GO
