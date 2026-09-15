-- Seed app.MeetingDiscussionPoint — ALL rows from docs/source/analysis/access-database.md §4 (tblMeetingDiscussionPoints).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.MeetingDiscussionPoint ON;

INSERT INTO app.MeetingDiscussionPoint ([MeetingDiscussionPointId], [AgendaItemId], [DiscussionPoint], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 1, N'Safety stock quantities', 0),
    (2, 2, N'Forecasting items with recurring usage', 0),
    (3, 3, N'Economic order quantities.', 0)
) AS s ([MeetingDiscussionPointId], [AgendaItemId], [DiscussionPoint], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.MeetingDiscussionPoint t WHERE t.[MeetingDiscussionPointId] = s.[MeetingDiscussionPointId]);

SET IDENTITY_INSERT app.MeetingDiscussionPoint OFF;
GO
