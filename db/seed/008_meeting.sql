-- Seed app.Meeting — ALL rows from docs/source/analysis/access-database.md §4 (tblMeetingMinutes (recovered)).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
-- Time-of-day cells that held whole dates in the source (meeting 3) map to TIME 00:00:00.
USE ProjectManager;
GO
SET IDENTITY_INSERT app.Meeting ON;

INSERT INTO app.Meeting ([MeetingId], [ProjectId], [Subject], [Description], [Location], [StartDate], [StartTime], [EndTime], [Conclusion], [NextMeeting], [FollowupAction], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 2, N'Progress Achieved', N'I have achieved success in making sure all items are connected and working. I need to work on the next point now', NULL, N'2024-12-12', N'17:00:00', N'18:00:00', N'I need to be faster in implementation of the work', N'2024-12-17', N'What shall we on notes?', 0),
    (2, 24, N'Effective replenishment processing', N'<div>Discuss ways to ensure we have restocking on time</div>', N'Upper Room', N'2024-12-17', N'16:00:00', N'19:00:00', N'Work on all components', NULL, NULL, 0),
    (3, 24, N'Order point calculations', N'Determining the most appropriate order cycle from each source of' + NCHAR(13) + NCHAR(10) + N'supply.', NULL, N'2024-12-24', N'00:00:00', N'00:00:00', N'Known when to take advantage of price breaks for a larger purchase.', N'2024-12-03', NULL, 0),
    (4, 24, N'When to take advantage of price breaks for a larger purchase.', N'Determining the target (best size) order with a vendor.' + NCHAR(13) + NCHAR(10) + N'Determining the most appropriate order cycle from each source of' + NCHAR(13) + NCHAR(10) + N'supply', NULL, NULL, NULL, NULL, N'When to take advantage of price breaks for a larger purchase.', NULL, NULL, 0),
    (5, NULL, N'Migration', N'Platform migration', NULL, N'2025-01-03', N'10:10:00', N'12:30:00', N'The next meeting', N'2025-01-18', N'None', 0)
) AS s ([MeetingId], [ProjectId], [Subject], [Description], [Location], [StartDate], [StartTime], [EndTime], [Conclusion], [NextMeeting], [FollowupAction], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.Meeting t WHERE t.[MeetingId] = s.[MeetingId]);

SET IDENTITY_INSERT app.Meeting OFF;
GO
