-- 010_project_assignee.sql — create app.ProjectAssignee table.
-- This table is queried by all stakeholder, Q&A, and future module procs for
-- row-level actor scope checks (FORBIDDEN_ROW 50003). It links users to the
-- projects they are assigned to, with a Role column for the actor's project role.
-- UserId is nullable — rows can be pre-populated before the auth module lands (#4).
-- Soft delete + ROWVERSION concurrency + audit columns (STANDARDS §2.2).
-- Idempotent: wrapped in IF OBJECT_ID … IS NULL guard.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.ProjectAssignee', N'U') IS NULL
BEGIN
    CREATE TABLE app.ProjectAssignee (
        ProjectAssigneeId INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_ProjectAssignee PRIMARY KEY,
        ProjectId         INT NOT NULL
            CONSTRAINT FK_ProjectAssignee_Project FOREIGN KEY REFERENCES app.Project(ProjectId),
        [Role]            NVARCHAR(50)  NOT NULL,
        PersonName        NVARCHAR(255) NOT NULL,
        UserId            INT NULL,       -- linked when auth module lands (#4)
        IsDeleted         BIT NOT NULL
            CONSTRAINT DF_ProjectAssignee_IsDeleted DEFAULT 0,
        CreatedBy         INT NULL,
        UpdatedBy         INT NULL,
        DeletedBy         INT NULL,
        CreatedAtUtc      DATETIME2 NOT NULL
            CONSTRAINT DF_ProjectAssignee_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        UpdatedAtUtc      DATETIME2 NULL,
        DeletedAtUtc      DATETIME2 NULL,
        RowVer            ROWVERSION NOT NULL
    );

    -- Primary access pattern: procs filter on ProjectId + UserId for scope checks.
    CREATE INDEX IX_ProjectAssignee_Project
        ON app.ProjectAssignee (ProjectId)
        WHERE IsDeleted = 0;

    CREATE INDEX IX_ProjectAssignee_User
        ON app.ProjectAssignee (UserId)
        WHERE IsDeleted = 0 AND UserId IS NOT NULL;
END;
GO
