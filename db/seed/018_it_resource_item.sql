-- Seed app.ItResourceItem — ALL rows from docs/source/analysis/access-database.md §4 (tblITResourcePlanningDetails).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.ItResourceItem ON;

INSERT INTO app.ItResourceItem ([ItResourceItemId], [ItResourceCategoryId], [DetailText], [Needed], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 1, N'Does this system need to be vetted by security? What needs to be added for Security in the Devis Techniques', 1, 0),
    (2, 2, N'Who are the users needed to be trained?', 1, 0),
    (3, 2, N'What do the users need to be trained on?', 0, 0),
    (4, 3, N'Does this system require an interface?', 1, 0),
    (5, 5, N'<div>Does the technicians need to be trained on the new system?</div>', 0, 0),
    (6, 6, N'<div>Does this require a greater capacity on our infrastructure?</div>', 0, 0),
    (7, 7, N'<div>This is a detail on new it resource</div>', 0, 0),
    (8, 8, N'<div>Does this system need an interface?</div>', 1, 0),
    (9, 10, N'<div>Does this system need an interface?</div>', 1, 0),
    (10, 10, N'<div>T<u>his </u>field support <strong>rich </strong>text <font' + NCHAR(13) + NCHAR(10) + N'face="Arial Rounded MT Bold" size=5><em>editing</em></font></div>', 0, 0),
    (11, 11, N'<div>Does this require a greater capacity on our infrastructure?</div>', 1, 0),
    (12, 12, N'<div>Who are the users who need to be trained?</div>', 1, 0),
    (13, 12, N'<div>What do the users need to be trained on?</div>', 1, 0),
    (14, 13, N'<div>Do the technicians need to be trained on the new system?</div>', 0, 0),
    (15, 14, N'<div>Does this system need to be vetted by security?</div>', 1, 0),
    (16, 14, N'<div>What needs to be added for security in Devis Technique?</div>', 0, 0),
    (17, 15, N'<div>Does this need new systems?</div>', 0, 0),
    (18, 16, N'<div>Do we need it?</div>', 1, 0)
) AS s ([ItResourceItemId], [ItResourceCategoryId], [DetailText], [Needed], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.ItResourceItem t WHERE t.[ItResourceItemId] = s.[ItResourceItemId]);

SET IDENTITY_INSERT app.ItResourceItem OFF;
GO
