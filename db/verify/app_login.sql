-- app_login.sql — CI assertion for ADR-0033, run as the admin login after scripts/db-apply.sh
-- created the app login (sqlcmd -v DB_APP_USER=<login>). It impersonates that login and fails
-- when the login can read, change or define anything directly, holds a server or database
-- right, or cannot execute a dbo routine. The objects are listed before impersonating: the app
-- login cannot even see the tables.
USE ProjectManager;
GO
SET NOCOUNT ON;

DECLARE @Objects TABLE (Name nvarchar(300) NOT NULL, Kind char(2) NOT NULL);
INSERT @Objects (Name, Kind)
SELECT QUOTENAME(SCHEMA_NAME(o.schema_id)) + N'.' + QUOTENAME(o.name), o.type
FROM sys.objects o
WHERE o.is_ms_shipped = 0 AND o.type IN ('U', 'V', 'P', 'FN', 'IF', 'TF');

DECLARE @Tables int = (SELECT COUNT(*) FROM @Objects WHERE Kind = 'U');
DECLARE @Routines int = (SELECT COUNT(*) FROM @Objects WHERE Kind IN ('P', 'FN') AND Name LIKE N'\[dbo\].%' ESCAPE N'\');
IF @Tables = 0 OR @Routines = 0
    THROW 50000, N'No tables or procs found: run scripts/db-apply.sh first.', 1;

DECLARE @Problems TABLE (Problem nvarchar(600) NOT NULL);

EXECUTE AS LOGIN = N'$(DB_APP_USER)';

IF IS_SRVROLEMEMBER(N'sysadmin') = 1
    INSERT @Problems VALUES (N'member of sysadmin');
IF IS_MEMBER(N'db_owner') = 1
    INSERT @Problems VALUES (N'member of db_owner');

INSERT @Problems (Problem)
SELECT N'server permission ' + p.Name
FROM (VALUES (N'CONTROL SERVER'), (N'ALTER ANY LOGIN'), (N'ALTER ANY DATABASE'), (N'CREATE ANY DATABASE'),
             (N'VIEW SERVER STATE'), (N'ADMINISTER BULK OPERATIONS'), (N'IMPERSONATE ANY LOGIN'),
             (N'ALTER ANY CREDENTIAL'), (N'ALTER SETTINGS'), (N'SHUTDOWN')) p (Name)
WHERE HAS_PERMS_BY_NAME(NULL, NULL, p.Name) = 1;

INSERT @Problems (Problem)
SELECT N'database permission ' + p.Name
FROM (VALUES (N'CONTROL'), (N'ALTER'), (N'CREATE TABLE'), (N'CREATE PROCEDURE'), (N'CREATE FUNCTION'),
             (N'CREATE VIEW'), (N'ALTER ANY USER'), (N'ALTER ANY ROLE'), (N'ALTER ANY SCHEMA'),
             (N'BACKUP DATABASE'), (N'VIEW DATABASE STATE'), (N'SHOWPLAN'), (N'SELECT'), (N'INSERT'),
             (N'UPDATE'), (N'DELETE'), (N'EXECUTE')) p (Name)
WHERE HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', p.Name) = 1;

INSERT @Problems (Problem)
SELECT p.Name + N' on ' + o.Name
FROM @Objects o
CROSS JOIN (VALUES (N'SELECT'), (N'INSERT'), (N'UPDATE'), (N'DELETE'), (N'ALTER'), (N'CONTROL'),
                   (N'VIEW DEFINITION'), (N'TAKE OWNERSHIP'), (N'REFERENCES')) p (Name)
WHERE HAS_PERMS_BY_NAME(o.Name, N'OBJECT', p.Name) = 1;

INSERT @Problems (Problem)
SELECT N'cannot EXECUTE ' + o.Name
FROM @Objects o
WHERE o.Kind IN ('P', 'FN') AND o.Name LIKE N'\[dbo\].%' ESCAPE N'\'
  AND ISNULL(HAS_PERMS_BY_NAME(o.Name, N'OBJECT', N'EXECUTE'), 0) = 0;

-- Behaviour, not only metadata: a password hash read and an audit delete must both be refused.
BEGIN TRY
    EXEC (N'SELECT TOP (0) PasswordHash FROM auth.[User];');
    INSERT @Problems VALUES (N'read auth.User directly');
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() <> 229
        INSERT @Problems VALUES (CONCAT(N'auth.User read failed with ', ERROR_NUMBER(), N' instead of 229: ', ERROR_MESSAGE()));
END CATCH;

BEGIN TRY
    EXEC (N'DELETE FROM audit.AuditLog WHERE 1 = 0;');
    INSERT @Problems VALUES (N'deleted from audit.AuditLog directly');
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() <> 229
        INSERT @Problems VALUES (CONCAT(N'audit.AuditLog delete failed with ', ERROR_NUMBER(), N' instead of 229: ', ERROR_MESSAGE()));
END CATCH;

REVERT;

IF EXISTS (SELECT 1 FROM @Problems)
BEGIN
    SELECT Problem FROM @Problems ORDER BY Problem;
    THROW 50000, N'The app login holds more than EXECUTE on dbo (rows above).', 1;
END;

DECLARE @Ok nvarchar(400) = CONCAT(N'app login $(DB_APP_USER): EXECUTE on ', @Routines, N' dbo routines, no direct right on ', @Tables, N' tables');
PRINT @Ok;
GO
