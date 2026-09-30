-- Seed app.MeetingActionItem — ALL rows from docs/source/analysis/access-database.md §4 (tblMeetingActionItems).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.MeetingActionItem ON;

INSERT INTO app.MeetingActionItem ([MeetingActionItemId], [DiscussionPointId], [AgendaItemId], [Action], [AssignedToStakeholderId], [DueDate], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 1, 1, N'Crisis prevention orders', 6, NULL, 0),
    (2, 1, 1, N'Increasing orders to meet a target requirement', 6, NULL, 0),
    (3, 1, 1, N'Decreasing orders to meet container capacities', 6, NULL, 0),
    (4, 1, 1, N'Cycle counting, reconciling count discrepancies', 6, NULL, 0),
    (5, 2, 2, N'Appropriate forecast period', 5, NULL, 0),
    (6, 2, 2, N'Analyzing past usage', 5, NULL, 0),
    (7, 2, 2, N'Trends', 5, NULL, 0),
    (8, 2, 2, N'Collaborative forecast', 5, NULL, 0),
    (9, 2, 2, N'Appropriate forecast horizon', 5, NULL, 0)
) AS s ([MeetingActionItemId], [DiscussionPointId], [AgendaItemId], [Action], [AssignedToStakeholderId], [DueDate], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.MeetingActionItem t WHERE t.[MeetingActionItemId] = s.[MeetingActionItemId]);

SET IDENTITY_INSERT app.MeetingActionItem OFF;
GO
