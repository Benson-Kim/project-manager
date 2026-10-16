-- app-login.sql — the server edition's runtime login (ADR-0033). scripts/db-apply.sh runs it on
-- every apply, after the procs and seeds, as the admin login. Not a migration: it carries a
-- secret, re-asserts the grants each time, and the desktop edition never runs it.
--
-- Role app_executor: EXECUTE on schema dbo (every usp_* and ufn_*) and nothing else. The procs
-- reach the app/auth/audit tables through ownership chaining (every schema is owned by dbo), so
-- a member can do exactly what the procs allow and cannot read or change a table directly.
--
-- Login $(DB_APP_USER): created, or its password reset when it differs, mapped to a database
-- user with default schema dbo, and placed in app_executor only. The sentinel __SKIP__ (no
-- DB_APP_PASSWORD given to db-apply.sh) leaves logins alone and only asserts the role.
-- The password arrives through sqlcmd's environment with its single quotes already doubled by
-- db-apply.sh; CREATE/ALTER LOGIN cannot take a variable, so it is quoted again with QUOTENAME.
USE ProjectManager;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DATABASE_PRINCIPAL_ID(N'app_executor') IS NULL
    CREATE ROLE app_executor AUTHORIZATION dbo;

GRANT EXECUTE ON SCHEMA::dbo TO app_executor;

DECLARE @RoleId int = DATABASE_PRINCIPAL_ID(N'app_executor');
IF EXISTS (SELECT 1 FROM sys.database_permissions
           WHERE grantee_principal_id = @RoleId AND state IN ('G', 'W')
             AND NOT (class = 3 AND major_id = SCHEMA_ID(N'dbo') AND permission_name = N'EXECUTE' AND state = 'G'))
    THROW 50000, N'app_executor holds a permission other than EXECUTE on schema dbo; revoke it.', 1;
IF EXISTS (SELECT 1 FROM sys.database_role_members WHERE member_principal_id = @RoleId)
    THROW 50000, N'app_executor is a member of another role; remove it.', 1;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Login sysname = N'$(DB_APP_USER)';
DECLARE @Password nvarchar(max) = N'$(DB_APP_PASSWORD_SQL)';
IF @Login = N'__SKIP__'
BEGIN
    PRINT N'app login: skipped (DB_APP_PASSWORD not set)';
    RETURN;
END;

IF @Login = N'' OR @Login LIKE N'%[^A-Za-z0-9_]%' OR @Login IN (N'sa', N'dbo', N'guest', N'public')
    THROW 50000, N'DB_APP_USER must be letters, digits or _ and not a built-in principal.', 1;
-- DATALENGTH, not LEN (which drops trailing spaces): QUOTENAME returns NULL above 128 characters.
IF DATALENGTH(@Password) / 2 NOT BETWEEN 8 AND 128
    THROW 50000, N'DB_APP_PASSWORD must be 8 to 128 characters.', 1;

DECLARE @Sql nvarchar(max);
DECLARE @LoginId int, @Sid varbinary(85), @Type char(1);
SELECT @LoginId = principal_id, @Sid = sid, @Type = type FROM sys.server_principals WHERE name = @Login;

IF @LoginId IS NULL
BEGIN
    SET @Sql = N'CREATE LOGIN ' + QUOTENAME(@Login) + N' WITH PASSWORD = ' + QUOTENAME(@Password, N'''')
             + N', DEFAULT_DATABASE = ProjectManager, CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;';
    EXEC (@Sql);
    SELECT @LoginId = principal_id, @Sid = sid FROM sys.server_principals WHERE name = @Login;
    PRINT CONCAT(N'app login: created ', @Login);
END
ELSE
BEGIN
    IF @Type <> 'S'
        THROW 50000, N'DB_APP_USER names a server principal that is not a SQL login.', 1;
    IF PWDCOMPARE(@Password, (SELECT password_hash FROM sys.sql_logins WHERE principal_id = @LoginId)) = 0
    BEGIN
        SET @Sql = N'ALTER LOGIN ' + QUOTENAME(@Login) + N' WITH PASSWORD = ' + QUOTENAME(@Password, N'''')
                 + N', CHECK_POLICY = ON;';
        EXEC (@Sql);
        PRINT CONCAT(N'app login: password reset for ', @Login);
    END;
END;

IF (SELECT owner_sid FROM sys.databases WHERE database_id = DB_ID()) = @Sid
    THROW 50000, N'DB_APP_USER owns the database; pick another login.', 1;

IF DATABASE_PRINCIPAL_ID(@Login) IS NULL
BEGIN
    SET @Sql = N'CREATE USER ' + QUOTENAME(@Login) + N' FOR LOGIN ' + QUOTENAME(@Login) + N' WITH DEFAULT_SCHEMA = dbo;';
    EXEC (@Sql);
END
ELSE IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @Login AND sid = @Sid)
BEGIN
    -- Orphaned by a restore onto another server: the user keeps its rights, the login's SID differs.
    SET @Sql = N'ALTER USER ' + QUOTENAME(@Login) + N' WITH LOGIN = ' + QUOTENAME(@Login) + N', DEFAULT_SCHEMA = dbo;';
    EXEC (@Sql);
END;

DECLARE @UserId int = DATABASE_PRINCIPAL_ID(@Login);
IF NOT EXISTS (SELECT 1 FROM sys.database_role_members
               WHERE role_principal_id = DATABASE_PRINCIPAL_ID(N'app_executor') AND member_principal_id = @UserId)
BEGIN
    SET @Sql = N'ALTER ROLE app_executor ADD MEMBER ' + QUOTENAME(@Login) + N';';
    EXEC (@Sql);
END;

-- Least privilege is asserted, not assumed: anything granted by hand fails the apply.
IF EXISTS (SELECT 1 FROM sys.server_role_members WHERE member_principal_id = @LoginId)
    THROW 50000, N'The app login holds a server role; remove it (it needs none).', 1;
IF EXISTS (SELECT 1 FROM sys.server_permissions
           WHERE grantee_principal_id = @LoginId AND state IN ('G', 'W') AND permission_name <> N'CONNECT SQL')
    THROW 50000, N'The app login holds a server permission other than CONNECT SQL; revoke it.', 1;
IF EXISTS (SELECT 1 FROM sys.database_role_members m
           JOIN sys.database_principals r ON r.principal_id = m.role_principal_id
           WHERE m.member_principal_id = @UserId AND r.name <> N'app_executor')
    THROW 50000, N'The app user is a member of a role other than app_executor; remove it.', 1;
IF EXISTS (SELECT 1 FROM sys.database_permissions
           WHERE grantee_principal_id = @UserId AND state IN ('G', 'W') AND permission_name <> N'CONNECT')
    THROW 50000, N'The app user holds a permission of its own besides CONNECT; revoke it.', 1;
IF EXISTS (SELECT 1 FROM sys.schemas WHERE principal_id = @UserId)
    THROW 50000, N'The app user owns a schema; transfer it to dbo.', 1;

PRINT CONCAT(N'app login: ', @Login, N' has EXECUTE on dbo through app_executor and nothing else');
GO
