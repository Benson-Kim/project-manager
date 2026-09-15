-- Seed app.Stakeholder — ALL rows from docs/source/analysis/access-database.md §4 (tblStakeholders).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.Stakeholder ON;

INSERT INTO app.Stakeholder ([StakeholderId], [ProjectId], [FirstName], [LastName], [DepartmentOrganization], [ProjectRole], [RoleDescription], [PhoneNumber], [PhoneExt], [Mobile], [EmailAddress], [PhysicalLocation], [OrgTitle], [CommunicationPreference], [EngagementLevel], [AdditionalNotes], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 2, N'Gary', N'Cantrall', N'Organization and efficiency', N'Developer', NULL, N'+1 561 6718 677', N'166', N'89766780', NULL, N'Aus', N'Software Engineer', N'Email', N'Medium', NULL, 0),
    (2, 2, N'Stakeholder Firstname', N'Stakeholder lastname', N'Workstyl', NULL, NULL, NULL, NULL, NULL, NULL, NULL, N'Product Designer', NULL, NULL, NULL, 0),
    (3, 2, N'Test2Firstname', N'Test2lastname', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0),
    (4, 24, N'Stakeholder fname', N'Stakeholder lnam', N'DptOrg', N'Role', NULL, N'Tel', N'676', N'70181888', NULL, N'Physical Location', N'OrgTitle', NULL, NULL, N'Notes', 0),
    (5, 24, N'Tome', N'Green', N'Datafire Technologies', N'Optimize database', NULL, N'+1 (678) 787-8919', N'767', N'897 675 7865', NULL, N'Toronto, Canada', N'Database designer', NULL, NULL, NULL, 0),
    (6, 24, N'Lucy', N'Taylor', N'High Cloud Services', N'Cloud Architect', NULL, N'+1 (454) 617-8181', N'765', N'087 617 1717', NULL, N'New York, United States', N'Developer', NULL, NULL, NULL, 0),
    (7, 26, N'Karen', N'Johnson', N'Nate''s Designers', N'Analyst', NULL, N'+1 (786) 766-9191', N'817', N'919 818 1717', NULL, N'Chicago', N'Product Designer', NULL, NULL, NULL, 0),
    (9, 27, N'Ministry of Education, Science and Technology', NULL, N'Kenyan Government', NULL, NULL, NULL, NULL, NULL, NULL, N'Nairobi', N'ICT Authority', NULL, NULL, NULL, 0)
) AS s ([StakeholderId], [ProjectId], [FirstName], [LastName], [DepartmentOrganization], [ProjectRole], [RoleDescription], [PhoneNumber], [PhoneExt], [Mobile], [EmailAddress], [PhysicalLocation], [OrgTitle], [CommunicationPreference], [EngagementLevel], [AdditionalNotes], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.Stakeholder t WHERE t.[StakeholderId] = s.[StakeholderId]);

SET IDENTITY_INSERT app.Stakeholder OFF;
GO
