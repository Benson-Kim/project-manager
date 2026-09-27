-- 004_auth_schema.sql — authentication schema (module auth-and-rbac, issue #4).
-- Adds: auth schema; auth.Role lookup; auth.User (STANDARDS §2.2 columns + auth
-- columns incl. SessionVersion revocation stamp, ADR-0017 JWT sessions — no
-- Session table); auth.LoginAttempt fixed-window per-IP rate-limit counters
-- (STANDARDS §4: 5/min/IP; not domain data — no soft delete/audit, same
-- exemption as app.ViewPreference); the FK app.ViewPreference.UserId →
-- auth.User deferred from migration 002. Idempotent: safe to re-run.
USE ProjectManager;
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'auth')
    EXEC (N'CREATE SCHEMA auth');
GO

-- Role — fixed vocabulary ); lookup table, no soft delete (like app.ActivityStatus).
IF OBJECT_ID(N'auth.Role', N'U') IS NULL
BEGIN
    CREATE TABLE auth.Role (
        RoleId    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Role PRIMARY KEY,
        Name      NVARCHAR(50) NOT NULL CONSTRAINT UQ_Role_Name UNIQUE,
        SortOrder INT NOT NULL CONSTRAINT DF_Role_SortOrder DEFAULT 0
    );
END;
GO

-- User — credentials + lockout counters + SessionVersion (JWT revocation stamp).
IF OBJECT_ID(N'auth.[User]', N'U') IS NULL
BEGIN
    CREATE TABLE auth.[User] (
        UserId             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_User PRIMARY KEY,
        Username           NVARCHAR(100) NOT NULL,
        PasswordHash       NVARCHAR(255) NOT NULL, -- argon2id encoded (never selected by List/GetById)
        DisplayName        NVARCHAR(255) NOT NULL,
        Email              NVARCHAR(255) NULL,
        RoleId             INT NOT NULL CONSTRAINT FK_User_Role_RoleId REFERENCES auth.Role (RoleId),
        IsActive           BIT NOT NULL CONSTRAINT DF_User_IsActive DEFAULT 1,
        MustChangePassword BIT NOT NULL CONSTRAINT DF_User_MustChangePassword DEFAULT 0,
        FailedLoginCount   INT NOT NULL CONSTRAINT DF_User_FailedLoginCount DEFAULT 0,
        LockedUntilUtc     DATETIME2 NULL,
        SessionVersion     INT NOT NULL CONSTRAINT DF_User_SessionVersion DEFAULT 1,
        IsDeleted          BIT NOT NULL CONSTRAINT DF_User_IsDeleted DEFAULT 0,
        DeletedAtUtc       DATETIME2 NULL,
        DeletedBy          INT NULL,
        CreatedAtUtc       DATETIME2 NOT NULL CONSTRAINT DF_User_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy          INT NOT NULL, -- 0 = system bootstrap (seed rows)
        UpdatedAtUtc       DATETIME2 NULL,
        UpdatedBy          INT NULL,
        RowVer             ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_User_Username' AND object_id = OBJECT_ID(N'auth.[User]'))
    CREATE UNIQUE INDEX UQ_User_Username ON auth.[User] (Username) WHERE IsDeleted = 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_User_RoleId' AND object_id = OBJECT_ID(N'auth.[User]'))
    CREATE INDEX IX_User_RoleId ON auth.[User] (RoleId, IsDeleted) INCLUDE (Username, DisplayName);
GO

-- LoginAttempt — fixed-window per-IP counters (STANDARDS §4: login 5/min/IP).
-- Ephemeral operational data: rows are purged by usp_LoginAttempt_Record.
IF OBJECT_ID(N'auth.LoginAttempt', N'U') IS NULL
BEGIN
    CREATE TABLE auth.LoginAttempt (
        IpAddress      NVARCHAR(45) NOT NULL,
        WindowStartUtc DATETIME2(0) NOT NULL,
        AttemptCount   INT NOT NULL CONSTRAINT DF_LoginAttempt_AttemptCount DEFAULT 1,
        CONSTRAINT PK_LoginAttempt PRIMARY KEY (IpAddress, WindowStartUtc)
    );
END;
GO

-- Deferred FK from migration 002: preferences belong to real users now.
IF OBJECT_ID(N'FK_ViewPreference_User_UserId', N'F') IS NULL
    ALTER TABLE app.ViewPreference
        ADD CONSTRAINT FK_ViewPreference_User_UserId
        FOREIGN KEY (UserId) REFERENCES auth.[User] (UserId);
GO
