-- Seed (e2e ONLY): link e2e-pm and e2e-contributor to project 2 so the
-- ProjectAssignee guard in Create/Update/Delete/GetById/List procs does not
-- reject E2E happy-path mutations with FORBIDDEN_ROW.
-- Applied only when E2E_SEED=1 (same guard as 028_e2e_users.sql). Idempotent.
-- Depends on: 028_e2e_users.sql (users must exist first).
USE ProjectManager;
GO
IF N'$(E2E_SEED)' = N'1'
BEGIN
    INSERT INTO app.ProjectAssignee (ProjectId, UserId, Role, PersonName, CreatedBy)
    SELECT 2, u.UserId, s.RoleName, s.DisplayName, 0
    FROM (VALUES
        (N'e2e-pm',          N'ProjectManager', N'E2E Project Manager'),
        (N'e2e-contributor', N'Contributor',    N'E2E Contributor')
    ) AS s (Username, RoleName, DisplayName)
    JOIN auth.[User] u ON u.Username = s.Username AND u.IsDeleted = 0
    WHERE NOT EXISTS (
        SELECT 1 FROM app.ProjectAssignee pa
        WHERE pa.ProjectId = 2 AND pa.UserId = u.UserId AND pa.IsDeleted = 0
    );
END;
GO
