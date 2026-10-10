-- 021_project_permissions.sql — per-person permission overrides and editable team titles
-- (ADR-0024, client feedback 2026-10-09).
--   1. app.ProjectPermissionOverride: within one project, one person's create / update / delete in one
--      section can be granted or revoked on top of their access level (Viewer · Contributor ·
--      Manager, ADR-0021). Reading follows the level. Keyed by (ProjectId, UserId): it belongs to the
--      person's membership, and usp_ProjectAssignee_Set deletes it when they leave the team.
--   2. Team titles become the managed list 'project-assignee.title' (ADR-0022): stored as text, the
--      codes are rewritten to their labels and the fixed CHECK is dropped. "Project manager" is locked:
--      usp_Project_Create gives a new project's creator that title.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.ProjectPermissionOverride', N'U') IS NULL
BEGIN
    CREATE TABLE app.ProjectPermissionOverride (
        ProjectId    INT          NOT NULL
            CONSTRAINT FK_ProjectPermissionOverride_Project REFERENCES app.Project (ProjectId),
        UserId       INT          NOT NULL
            CONSTRAINT FK_ProjectPermissionOverride_User REFERENCES auth.[User] (UserId),
        [Module]     NVARCHAR(50) NOT NULL,
        Verb         VARCHAR(10)  NOT NULL
            CONSTRAINT CK_ProjectPermissionOverride_Verb CHECK (Verb IN ('create', 'update', 'delete')),
        Allowed      BIT          NOT NULL,
        CreatedAtUtc DATETIME2    NOT NULL
            CONSTRAINT DF_ProjectPermissionOverride_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT          NOT NULL,
        CONSTRAINT PK_ProjectPermissionOverride PRIMARY KEY (ProjectId, UserId, [Module], Verb)
    );
END;
GO

-- 2. Team titles as a managed list.
IF NOT EXISTS (SELECT 1 FROM app.LookupList WHERE ListKey = N'project-assignee.title')
    INSERT INTO app.LookupList (ListKey) VALUES (N'project-assignee.title');
GO

DECLARE @Seed TABLE (ListKey NVARCHAR(64), Label NVARCHAR(50), SortOrder INT, IsLocked BIT);
INSERT INTO @Seed (ListKey, Label, SortOrder, IsLocked) VALUES
    (N'project-assignee.title',               N'Project manager',  1, 1),
    (N'project-assignee.title',               N'Sponsor',          2, 0),
    (N'project-assignee.title',               N'Business analyst', 3, 0),
    (N'project-assignee.title',               N'Team member',      4, 0),
    (N'project-assignee.title',               N'Stakeholder',      5, 0);

INSERT INTO app.LookupOption (ListKey, Label, SortOrder, IsLocked, CreatedBy)
SELECT s.ListKey, s.Label, s.SortOrder, s.IsLocked, 0
FROM @Seed s
WHERE NOT EXISTS (SELECT 1 FROM app.LookupOption o WHERE o.ListKey = s.ListKey);
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ProjectAssignee_Role'
           AND parent_object_id = OBJECT_ID(N'app.ProjectAssignee'))
    ALTER TABLE app.ProjectAssignee DROP CONSTRAINT CK_ProjectAssignee_Role;
GO

-- Codes -> labels (live and soft-deleted rows, so a revived member matches the list).
UPDATE app.ProjectAssignee
SET [Role] = CASE [Role]
                 WHEN N'ProjectManager'  THEN N'Project manager'
                 WHEN N'BusinessAnalyst' THEN N'Business analyst'
                 WHEN N'TeamMember'      THEN N'Team member'
             END
WHERE [Role] IN (N'ProjectManager', N'BusinessAnalyst', N'TeamMember');
GO
