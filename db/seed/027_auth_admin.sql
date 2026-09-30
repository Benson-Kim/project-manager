-- Seed: bootstrap admin user with MustChangePassword = 1 (forced change on
-- first login). NO plaintext or hash is committed: scripts/db-apply.sh computes
-- the argon2id hash at seed time from the SEED_ADMIN_PASSWORD env var (or takes
-- a precomputed SEED_ADMIN_PASSWORD_HASH) and passes it in as a sqlcmd
-- scripting variable. When neither is provided the sentinel '__SKIP__' arrives
-- here and the admin seed is skipped with a warning (login is impossible until
-- seeded). CreatedBy = 0 means system bootstrap. Idempotent.
USE ProjectManager;
GO
IF N'$(SEED_ADMIN_PASSWORD_HASH)' = N'__SKIP__'
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.[User] WHERE Username = N'admin' AND IsDeleted = 0)
        PRINT N'WARNING: admin user NOT seeded — set SEED_ADMIN_PASSWORD (or SEED_ADMIN_PASSWORD_HASH) and re-run scripts/db-apply.sh.';
END
ELSE IF NOT EXISTS (SELECT 1 FROM auth.[User] WHERE Username = N'admin' AND IsDeleted = 0)
BEGIN
    INSERT INTO auth.[User] (Username, PasswordHash, DisplayName, RoleId, MustChangePassword, CreatedBy)
    SELECT N'admin', N'$(SEED_ADMIN_PASSWORD_HASH)', N'Administrator', r.RoleId, 1, 0
    FROM auth.Role r WHERE r.Name = N'Admin';
END;
GO
