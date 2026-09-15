-- Seed (e2e ONLY): one test user per role, e2e- prefix, shared password from
-- the E2E_USER_PASSWORD env var (hashed by scripts/db-apply.sh, same mechanism
-- as 027). Applied only when E2E_SEED=1 — never on real environments.
-- MustChangePassword = 0 so login specs are not detoured. Idempotent.
USE ProjectManager;
GO
IF N'$(E2E_SEED)' = N'1' AND N'$(E2E_USER_PASSWORD_HASH)' <> N'__SKIP__'
BEGIN
    INSERT INTO auth.[User] (Username, PasswordHash, DisplayName, RoleId, MustChangePassword, CreatedBy)
    SELECT s.Username, N'$(E2E_USER_PASSWORD_HASH)', s.DisplayName, r.RoleId, 0, 0
    FROM (VALUES
        (N'e2e-admin', N'E2E Admin', N'Admin'),
        (N'e2e-pm', N'E2E Project Manager', N'ProjectManager'),
        (N'e2e-contributor', N'E2E Contributor', N'Contributor'),
        (N'e2e-viewer', N'E2E Viewer', N'Viewer')
    ) AS s (Username, DisplayName, RoleName)
    JOIN auth.Role r ON r.Name = s.RoleName
    WHERE NOT EXISTS (SELECT 1 FROM auth.[User] u WHERE u.Username = s.Username AND u.IsDeleted = 0);
END;
GO
