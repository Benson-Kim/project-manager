-- Seed (e2e ONLY): the e2e team of project 2, one user per access level (ADR-0021), so the
-- per-project checks in every project-scoped proc are exercised by the RBAC specs:
--   e2e-pm          ProjectManager  Manager      (full edit, delete, team)
--   e2e-contributor TeamMember      Contributor  (add/edit on operational modules, no delete)
--   e2e-viewer      Stakeholder     Viewer       (read only)
-- Applied only when E2E_SEED=1 (same guard as 028_e2e_users.sql). Idempotent.
-- Depends on: 017_project_access_level.sql (AccessLevel column), 028_e2e_users.sql (users).
USE ProjectManager;
GO
IF N'$(E2E_SEED)' = N'1'
BEGIN
    INSERT INTO app.ProjectAssignee (ProjectId, UserId, [Role], PersonName, AccessLevel, CreatedBy)
    SELECT 2, u.UserId, s.Title, u.DisplayName, s.AccessLevel, 0
    FROM (VALUES
        (N'e2e-pm',          N'ProjectManager', N'Manager'),
        (N'e2e-contributor', N'TeamMember',     N'Contributor'),
        (N'e2e-viewer',      N'Stakeholder',    N'Viewer')
    ) AS s (Username, Title, AccessLevel)
    JOIN auth.[User] u ON u.Username = s.Username AND u.IsDeleted = 0
    WHERE EXISTS (SELECT 1 FROM app.Project p WHERE p.ProjectId = 2 AND p.IsDeleted = 0)
      AND NOT EXISTS (
          SELECT 1 FROM app.ProjectAssignee pa
          WHERE pa.ProjectId = 2 AND pa.UserId = u.UserId AND pa.IsDeleted = 0
      );
END;
GO
