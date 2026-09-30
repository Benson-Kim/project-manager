-- Seed app.KeyDeliverableAssignee — multi-assignee junction rows for the 8
-- key deliverables seeded in 006_key_deliverable.sql (2026 data set).
-- Uses MERGE so re-running is fully idempotent.
-- Stakeholder ↔ Project mapping from 003_stakeholder.sql:
--   StakeholderIds 1,2,3 → ProjectId 2
--   StakeholderIds 4,5,6 → ProjectId 24
--   StakeholderId  7     → ProjectId 26
--   StakeholderId  9     → ProjectId 27
-- CreatedBy = 0 (system/migration actor).
USE ProjectManager;
GO

MERGE app.KeyDeliverableAssignee AS tgt
USING (VALUES
    -- KD 1 (Project 2, Infrastructure assessment): Gary Cantrall + Test2Firstname
    (1, 1, 0),
    (1, 3, 0),
    -- KD 2 (Project 2, Network topology): Gary Cantrall + Stakeholder Firstname
    (2, 1, 0),
    (2, 2, 0),
    -- KD 3 (Project 2, Database migration): all three project-2 stakeholders
    (3, 1, 0),
    (3, 2, 0),
    (3, 3, 0),
    -- KD 4 (Project 24, Security audit): Stakeholder fname + Tome Green
    (4, 4, 0),
    (4, 5, 0),
    -- KD 5 (Project 24, Staging environment): Tome Green + Lucy Taylor
    (5, 5, 0),
    (5, 6, 0),
    -- KD 6 (Project 24, Containerisation): all three project-24 stakeholders
    (6, 4, 0),
    (6, 5, 0),
    (6, 6, 0),
    -- KD 7 (Project 26, Data validation): Karen Johnson (only project-26 stakeholder)
    (7, 7, 0),
    -- KD 8 (Project 27, Biometric auth): Ministry of Education (only project-27 stakeholder)
    (8, 9, 0)
) AS s ([KeyDeliverableId], [StakeholderId], [CreatedBy])
ON  tgt.KeyDeliverableId = s.KeyDeliverableId
AND tgt.StakeholderId    = s.StakeholderId
WHEN NOT MATCHED BY TARGET THEN INSERT
    ([KeyDeliverableId], [StakeholderId], [CreatedBy])
    VALUES (s.[KeyDeliverableId], s.[StakeholderId], s.[CreatedBy]);
GO
