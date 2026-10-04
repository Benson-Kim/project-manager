-- Seed app.KeyDeliverableAssignee — source-backed assignments only.
-- Source: docs/source/analysis/access-database.md §4 tblKeyRequirementsDeliverable.
-- Only rows whose "Assigned To" is non-null in the source are seeded here:
--   KD 1 (ProjectId 2)  → StakeholderId 3  (source row 1, Assigned To = 3)
--   KD 7 (ProjectId 24) → StakeholderId 5  (source row 7, Assigned To = 5)
-- All other assignments in the source are NULL and must not be fabricated.
-- Uses MERGE so re-running is fully idempotent.
-- CreatedBy = 0 (system/migration actor).
-- NOTE: on an upgrade path, migration 015 copies these same rows from
-- AssignedToStakeholderId; the NOT EXISTS guard in that migration makes
-- this seed idempotent with respect to the upgrade path too.
USE ProjectManager;
GO

MERGE app.KeyDeliverableAssignee AS tgt
USING (VALUES
    -- KD 1 (Project 2): source Assigned To = 3
    (1, 3, 0),
    -- KD 7 (Project 24): source Assigned To = 5
    (7, 5, 0)
) AS s ([KeyDeliverableId], [StakeholderId], [CreatedBy])
ON  tgt.KeyDeliverableId = s.KeyDeliverableId
AND tgt.StakeholderId    = s.StakeholderId
WHEN NOT MATCHED BY TARGET THEN INSERT
    ([KeyDeliverableId], [StakeholderId], [CreatedBy])
    VALUES (s.[KeyDeliverableId], s.[StakeholderId], s.[CreatedBy]);
GO
