-- Seed app.KeyDeliverable — ALL rows from docs/source/analysis/access-database.md §4 (tblKeyRequirementsDeliverable).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.KeyDeliverable ON;

INSERT INTO app.KeyDeliverable ([KeyDeliverableId], [ProjectId], [KeyRequirement], [Deadline], [AssignedToStakeholderId], [Priority], [Status], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 2, N'12.1-The system must allow for the content to have a strikethrough.', N'2024-12-25', 3, N'Important', N'Pending', 0),
    (2, 2, N'13.2-The systems "To do list" is made up of Daily task line items that can be arranged in any order.', NULL, NULL, NULL, NULL, 0),
    (3, 2, N'5.1 The system dropdown "Person Responsible" should be generated from the stakeholder list in the project.', NULL, NULL, NULL, NULL, 0),
    (4, 2, N'0.2-The system must have a responsive field where the actor can type the beginning of the project name and it will find the name in the drop down list.', NULL, NULL, NULL, NULL, 0),
    (5, NULL, N'new', NULL, NULL, NULL, NULL, 0),
    (6, 2, N'New Key Requirement Deliverable', NULL, NULL, NULL, NULL, 0),
    (7, 24, N'Fast reports generation', N'2024-12-26', 5, N'Important', N'In Progress', 0),
    (8, 1, NULL, NULL, NULL, NULL, NULL, 0)
) AS s ([KeyDeliverableId], [ProjectId], [KeyRequirement], [Deadline], [AssignedToStakeholderId], [Priority], [Status], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.KeyDeliverable t WHERE t.[KeyDeliverableId] = s.[KeyDeliverableId]);

SET IDENTITY_INSERT app.KeyDeliverable OFF;
GO
