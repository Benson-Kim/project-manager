-- 001_init.sql — schemas, audit log and first lookup table.
-- Idempotent: safe to re-run.
IF DB_ID(N'ProjectManager') IS NULL
BEGIN
    CREATE DATABASE ProjectManager;
END;
GO
USE ProjectManager;
GO

IF SCHEMA_ID(N'app') IS NULL EXEC (N'CREATE SCHEMA app');
GO
IF SCHEMA_ID(N'auth') IS NULL EXEC (N'CREATE SCHEMA auth');
GO
IF SCHEMA_ID(N'audit') IS NULL EXEC (N'CREATE SCHEMA audit');
GO

-- Every mutating stored procedure writes here (see AGENTS.md).
IF OBJECT_ID(N'audit.AuditLog', N'U') IS NULL
BEGIN
    CREATE TABLE audit.AuditLog (
        AuditLogId    BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_AuditLog PRIMARY KEY,
        ActorUserId   INT NULL,
        Action        NVARCHAR(50) NOT NULL,   -- Create / Update / Delete / Login / …
        EntityName    NVARCHAR(128) NOT NULL,
        EntityId      NVARCHAR(64) NULL,
        BeforeJson    NVARCHAR(MAX) NULL,
        AfterJson     NVARCHAR(MAX) NULL,
        IpAddress     NVARCHAR(45) NULL,
        OccurredAtUtc DATETIME2 NOT NULL CONSTRAINT DF_AuditLog_OccurredAtUtc DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_AuditLog_Entity ON audit.AuditLog (EntityName, EntityId);
    CREATE INDEX IX_AuditLog_OccurredAtUtc ON audit.AuditLog (OccurredAtUtc);
END;
GO

-- Lookup migrated from tblActivityStatusType (values from the Access data:
-- statuses observed across tblDailyActivityList / tblTodoList).
IF OBJECT_ID(N'app.ActivityStatus', N'U') IS NULL
BEGIN
    CREATE TABLE app.ActivityStatus (
        ActivityStatusId INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_ActivityStatus PRIMARY KEY,
        Name             NVARCHAR(50) NOT NULL CONSTRAINT UQ_ActivityStatus_Name UNIQUE,
        SortOrder        INT NOT NULL CONSTRAINT DF_ActivityStatus_SortOrder DEFAULT 0
    );
END;
GO
