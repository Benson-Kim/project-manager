-- 084_project_password.sql — per-person project passwords.
--   ProjectLock: one person's own password on one project, stored as an argon2id hash made by the app.
--     No row = that person sees the project as before. Other members are never affected.
--   ProjectUnlock: that person's open unlock. It counts only while ExpiresAtUtc is ahead and its
--     SessionVersion still equals auth.[User].SessionVersion; sign-in and sign-out delete it.
--   ProjectUnlockAttempt: wrong passwords in a row; 5, each within 15 minutes of the last, pause tries
--     for 15 minutes. A right password clears it.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.ProjectLock', N'U') IS NULL
    CREATE TABLE app.ProjectLock (
        ProjectId    INT           NOT NULL CONSTRAINT FK_ProjectLock_Project REFERENCES app.Project (ProjectId),
        UserId       INT           NOT NULL CONSTRAINT FK_ProjectLock_User REFERENCES auth.[User] (UserId),
        PasswordHash NVARCHAR(200) NOT NULL CONSTRAINT CK_ProjectLock_Hash CHECK (PasswordHash LIKE N'$argon2id$%'),
        SetAtUtc     DATETIME2(0)  NOT NULL CONSTRAINT DF_ProjectLock_SetAtUtc DEFAULT SYSUTCDATETIME(),
        RowVer       ROWVERSION    NOT NULL,
        CONSTRAINT PK_ProjectLock PRIMARY KEY (ProjectId, UserId)
    );
GO

IF OBJECT_ID(N'app.ProjectUnlock', N'U') IS NULL
    CREATE TABLE app.ProjectUnlock (
        ProjectId      INT          NOT NULL,
        UserId         INT          NOT NULL,
        SessionVersion INT          NOT NULL,
        UnlockedAtUtc  DATETIME2(0) NOT NULL CONSTRAINT DF_ProjectUnlock_UnlockedAtUtc DEFAULT SYSUTCDATETIME(),
        ExpiresAtUtc   DATETIME2(0) NOT NULL,
        CONSTRAINT PK_ProjectUnlock PRIMARY KEY (ProjectId, UserId),
        CONSTRAINT FK_ProjectUnlock_Lock FOREIGN KEY (ProjectId, UserId)
            REFERENCES app.ProjectLock (ProjectId, UserId) ON DELETE CASCADE,
        CONSTRAINT CK_ProjectUnlock_Expiry CHECK (ExpiresAtUtc > UnlockedAtUtc)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ProjectUnlock_UserId'
               AND object_id = OBJECT_ID(N'app.ProjectUnlock'))
    CREATE INDEX IX_ProjectUnlock_UserId ON app.ProjectUnlock (UserId);
GO

IF OBJECT_ID(N'app.ProjectUnlockAttempt', N'U') IS NULL
    CREATE TABLE app.ProjectUnlockAttempt (
        ProjectId       INT          NOT NULL,
        UserId          INT          NOT NULL,
        FailedCount     INT          NOT NULL CONSTRAINT DF_ProjectUnlockAttempt_FailedCount DEFAULT 0
                                     CONSTRAINT CK_ProjectUnlockAttempt_FailedCount CHECK (FailedCount >= 0),
        LastFailedAtUtc DATETIME2(3) NULL,
        PausedUntilUtc  DATETIME2(0) NULL,
        CONSTRAINT PK_ProjectUnlockAttempt PRIMARY KEY (ProjectId, UserId),
        CONSTRAINT FK_ProjectUnlockAttempt_Lock FOREIGN KEY (ProjectId, UserId)
            REFERENCES app.ProjectLock (ProjectId, UserId) ON DELETE CASCADE
    );
GO
