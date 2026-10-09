-- 017_project_access_level.sql — per-project access levels (ADR-0021).
-- A person's rights now come from their assignment in each project, not from one global role:
--   1. auth.AccessLevel: the ranked vocabulary Viewer (1) < Contributor (2) < Manager (3)
--      that every access check compares against (dbo.usp_AccessLevel_Require).
--   2. app.ProjectAssignee.AccessLevel (FK -> auth.AccessLevel), backfilled so nobody's
--      effective rights change: rows linked to a user take that user's former global role
--      (Admin/ProjectManager -> Manager, Contributor -> Contributor, Viewer -> Viewer);
--      name-only rows follow their title.
--   3. app.ProjectAssignee.UserId gains its FK to auth.[User] (deferred since #4).
--   4. Assignment titles (display only) widen with TeamMember and Stakeholder.
--   5. Global roles collapse to Admin | User. Moved users get SessionVersion + 1 so any
--      JWT still carrying a retired role is revoked on its next request (ADR-0017).
--   6. The scaffold assignee CRUD procs are dropped: dbo.usp_ProjectAssignee_Set is the only write path.
-- Data steps run once (guarded by the retired roles still existing). Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'auth.AccessLevel', N'U') IS NULL
BEGIN
    CREATE TABLE auth.AccessLevel (
        Name   NVARCHAR(20) NOT NULL CONSTRAINT PK_AccessLevel PRIMARY KEY,
        [Rank] TINYINT      NOT NULL CONSTRAINT UQ_AccessLevel_Rank UNIQUE
    );
END;
GO

MERGE auth.AccessLevel AS t
USING (VALUES (N'Viewer', 1), (N'Contributor', 2), (N'Manager', 3)) AS s (Name, [Rank])
ON t.Name = s.Name
WHEN NOT MATCHED THEN INSERT (Name, [Rank]) VALUES (s.Name, s.[Rank]);
GO

IF COL_LENGTH(N'app.ProjectAssignee', N'AccessLevel') IS NULL
    ALTER TABLE app.ProjectAssignee ADD AccessLevel NVARCHAR(20) NOT NULL
        CONSTRAINT DF_ProjectAssignee_AccessLevel DEFAULT N'Viewer'
        CONSTRAINT FK_ProjectAssignee_AccessLevel REFERENCES auth.AccessLevel (Name);
GO

-- Backfill before the global roles are retired (step 5 needs them gone afterwards).
IF EXISTS (SELECT 1 FROM auth.Role WHERE Name IN (N'ProjectManager', N'Contributor', N'Viewer'))
BEGIN
    UPDATE pa SET AccessLevel = CASE r.Name
                                    WHEN N'Admin'          THEN N'Manager'
                                    WHEN N'ProjectManager' THEN N'Manager'
                                    WHEN N'Contributor'    THEN N'Contributor'
                                    ELSE N'Viewer'
                                END
    FROM app.ProjectAssignee pa
    JOIN auth.[User] u ON u.UserId = pa.UserId
    JOIN auth.Role r   ON r.RoleId = u.RoleId;

    UPDATE app.ProjectAssignee
    SET AccessLevel = CASE [Role]
                          WHEN N'ProjectManager'  THEN N'Manager'
                          WHEN N'BusinessAnalyst' THEN N'Contributor'
                          ELSE N'Viewer'
                      END
    WHERE UserId IS NULL;
END;
GO

-- UserId FK: unlink orphans first (an assignment to a user that no longer exists grants nothing).
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ProjectAssignee_User'
               AND parent_object_id = OBJECT_ID(N'app.ProjectAssignee'))
BEGIN
    UPDATE pa SET UserId = NULL
    FROM app.ProjectAssignee pa
    WHERE pa.UserId IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM auth.[User] u WHERE u.UserId = pa.UserId);

    ALTER TABLE app.ProjectAssignee
        ADD CONSTRAINT FK_ProjectAssignee_User FOREIGN KEY (UserId) REFERENCES auth.[User] (UserId);
END;
GO

-- Covering index for the access lookup (ProjectId + UserId -> AccessLevel).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ProjectAssignee_Access'
               AND object_id = OBJECT_ID(N'app.ProjectAssignee'))
    CREATE INDEX IX_ProjectAssignee_Access
        ON app.ProjectAssignee (ProjectId, UserId) INCLUDE (AccessLevel)
        WHERE IsDeleted = 0 AND UserId IS NOT NULL;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ProjectAssignee_Role'
           AND parent_object_id = OBJECT_ID(N'app.ProjectAssignee'))
    ALTER TABLE app.ProjectAssignee DROP CONSTRAINT CK_ProjectAssignee_Role;
GO
ALTER TABLE app.ProjectAssignee ADD CONSTRAINT CK_ProjectAssignee_Role
    CHECK ([Role] IN (N'ProjectManager', N'Sponsor', N'BusinessAnalyst', N'TeamMember', N'Stakeholder'));
GO

-- Global roles: Admin | User.
IF EXISTS (SELECT 1 FROM auth.Role WHERE Name IN (N'ProjectManager', N'Contributor', N'Viewer'))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.Role WHERE Name = N'User')
        INSERT INTO auth.Role (Name, SortOrder) VALUES (N'User', 2);

    DECLARE @UserRoleId INT = (SELECT RoleId FROM auth.Role WHERE Name = N'User');

    UPDATE u SET RoleId         = @UserRoleId,
                 SessionVersion = u.SessionVersion + 1,
                 UpdatedAtUtc   = SYSUTCDATETIME(),
                 UpdatedBy      = 0
    FROM auth.[User] u
    JOIN auth.Role r ON r.RoleId = u.RoleId
    WHERE r.Name IN (N'ProjectManager', N'Contributor', N'Viewer');

    DELETE FROM auth.Role WHERE Name IN (N'ProjectManager', N'Contributor', N'Viewer');
END;
GO

-- Team writes go through dbo.usp_ProjectAssignee_Set only: it owns the rules above (access
-- levels, active accounts, no self-lockout). The unused scaffold CRUD procs would bypass them.
DROP PROCEDURE IF EXISTS dbo.usp_ProjectAssignee_Create;
DROP PROCEDURE IF EXISTS dbo.usp_ProjectAssignee_Update;
DROP PROCEDURE IF EXISTS dbo.usp_ProjectAssignee_Delete;
DROP PROCEDURE IF EXISTS dbo.usp_ProjectAssignee_GetById;
GO
