-- 071_responsibility_matrices.sql — Responsibility matrices: RACI and eight other frameworks laid
-- over a project's WBS items or its decisions. The frameworks and their roles are seeded here; their
-- display names live in the app's messages. A matrix's framework and row kind are fixed when it is
-- created, and composite keys keep every member and cell inside the matrix's project and framework.
-- A cell needs its member column, so removing a member removes that column's cells first. On a
-- WBS-row matrix the framework's assignee role is never stored as a cell: it is the item's assignees.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.ResponsibilityFramework', N'U') IS NULL
    CREATE TABLE app.ResponsibilityFramework (
        FrameworkCode  NVARCHAR(16) NOT NULL CONSTRAINT PK_ResponsibilityFramework PRIMARY KEY,
        DefaultRowKind NVARCHAR(16) NOT NULL
            CONSTRAINT CK_ResponsibilityFramework_RowKind CHECK (DefaultRowKind IN (N'WbsItem', N'Decision')),
        SortOrder      INT NOT NULL
    );
GO

IF OBJECT_ID(N'app.ResponsibilityRole', N'U') IS NULL
    CREATE TABLE app.ResponsibilityRole (
        FrameworkCode  NVARCHAR(16) NOT NULL
            CONSTRAINT FK_ResponsibilityRole_Framework REFERENCES app.ResponsibilityFramework (FrameworkCode),
        RoleCode       NVARCHAR(24) NOT NULL,
        Abbrev         NVARCHAR(4)  NOT NULL,
        OnePerRow      BIT NOT NULL,
        RequiredPerRow BIT NOT NULL,
        IsAssigneeRole BIT NOT NULL,
        SortOrder      INT NOT NULL,
        CONSTRAINT PK_ResponsibilityRole PRIMARY KEY (FrameworkCode, RoleCode),
        CONSTRAINT UX_ResponsibilityRole_Abbrev UNIQUE (FrameworkCode, Abbrev)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ResponsibilityRole_Assignee'
                 AND object_id = OBJECT_ID(N'app.ResponsibilityRole'))
    CREATE UNIQUE INDEX UX_ResponsibilityRole_Assignee
        ON app.ResponsibilityRole (FrameworkCode) WHERE IsAssigneeRole = 1;
GO

DECLARE @Frameworks TABLE (FrameworkCode NVARCHAR(16), DefaultRowKind NVARCHAR(16), SortOrder INT);
INSERT INTO @Frameworks VALUES
    (N'RACI', N'WbsItem', 1), (N'DACI', N'Decision', 2), (N'RAPID', N'Decision', 3),
    (N'DARE', N'Decision', 4), (N'RASCI', N'WbsItem', 5), (N'RACI_VS', N'WbsItem', 6),
    (N'ARPA', N'WbsItem', 7), (N'MOCHA', N'WbsItem', 8), (N'RATSI', N'WbsItem', 9);

INSERT INTO app.ResponsibilityFramework (FrameworkCode, DefaultRowKind, SortOrder)
SELECT f.FrameworkCode, f.DefaultRowKind, f.SortOrder
FROM @Frameworks f
WHERE NOT EXISTS (SELECT 1 FROM app.ResponsibilityFramework x WHERE x.FrameworkCode = f.FrameworkCode);

DECLARE @Roles TABLE (FrameworkCode NVARCHAR(16), RoleCode NVARCHAR(24), Abbrev NVARCHAR(4),
                      OnePerRow BIT, RequiredPerRow BIT, IsAssigneeRole BIT, SortOrder INT);
INSERT INTO @Roles VALUES
    (N'RACI', N'RESPONSIBLE', N'R', 0, 1, 1, 1), (N'RACI', N'ACCOUNTABLE', N'A', 1, 1, 0, 2),
    (N'RACI', N'CONSULTED', N'C', 0, 0, 0, 3), (N'RACI', N'INFORMED', N'I', 0, 0, 0, 4),

    (N'DACI', N'DRIVER', N'D', 1, 1, 1, 1), (N'DACI', N'APPROVER', N'A', 1, 1, 0, 2),
    (N'DACI', N'CONTRIBUTOR', N'C', 0, 0, 0, 3), (N'DACI', N'INFORMED', N'I', 0, 0, 0, 4),

    (N'RAPID', N'RECOMMEND', N'R', 0, 0, 0, 1), (N'RAPID', N'AGREE', N'A', 0, 0, 0, 2),
    (N'RAPID', N'PERFORM', N'P', 0, 0, 1, 3), (N'RAPID', N'INPUT', N'I', 0, 0, 0, 4),
    (N'RAPID', N'DECIDE', N'D', 1, 1, 0, 5),

    (N'DARE', N'DECIDER', N'D', 0, 1, 0, 1), (N'DARE', N'ADVISOR', N'A', 0, 0, 0, 2),
    (N'DARE', N'RECOMMENDER', N'R', 0, 0, 0, 3), (N'DARE', N'EXECUTION', N'E', 0, 0, 1, 4),

    (N'RASCI', N'RESPONSIBLE', N'R', 0, 1, 1, 1), (N'RASCI', N'ACCOUNTABLE', N'A', 1, 1, 0, 2),
    (N'RASCI', N'SUPPORT', N'S', 0, 0, 0, 3), (N'RASCI', N'CONSULTED', N'C', 0, 0, 0, 4),
    (N'RASCI', N'INFORMED', N'I', 0, 0, 0, 5),

    (N'RACI_VS', N'RESPONSIBLE', N'R', 0, 1, 1, 1), (N'RACI_VS', N'ACCOUNTABLE', N'A', 1, 1, 0, 2),
    (N'RACI_VS', N'CONSULTED', N'C', 0, 0, 0, 3), (N'RACI_VS', N'INFORMED', N'I', 0, 0, 0, 4),
    (N'RACI_VS', N'VERIFIER', N'V', 0, 0, 0, 5), (N'RACI_VS', N'SIGN_OFF', N'S', 0, 0, 0, 6),

    (N'ARPA', N'ACCOUNTABLE', N'A', 1, 1, 0, 1), (N'ARPA', N'RESPONSIBLE', N'R', 0, 0, 1, 2),
    (N'ARPA', N'PARTICIPANT', N'P', 0, 0, 0, 3), (N'ARPA', N'ADVISOR', N'Ad', 0, 0, 0, 4),

    (N'MOCHA', N'MANAGER', N'M', 1, 1, 0, 1), (N'MOCHA', N'OWNER', N'O', 1, 1, 1, 2),
    (N'MOCHA', N'CONSULTED', N'C', 0, 0, 0, 3), (N'MOCHA', N'HELPER', N'H', 0, 0, 0, 4),
    (N'MOCHA', N'APPROVER', N'A', 1, 0, 0, 5),

    (N'RATSI', N'RESPONSIBLE', N'R', 0, 1, 0, 1), (N'RATSI', N'AUTHORITY', N'A', 1, 1, 0, 2),
    (N'RATSI', N'TASK', N'T', 0, 0, 1, 3), (N'RATSI', N'SUPPORT', N'S', 0, 0, 0, 4),
    (N'RATSI', N'INFORMED', N'I', 0, 0, 0, 5);

INSERT INTO app.ResponsibilityRole
    (FrameworkCode, RoleCode, Abbrev, OnePerRow, RequiredPerRow, IsAssigneeRole, SortOrder)
SELECT r.FrameworkCode, r.RoleCode, r.Abbrev, r.OnePerRow, r.RequiredPerRow, r.IsAssigneeRole, r.SortOrder
FROM @Roles r
WHERE NOT EXISTS (SELECT 1 FROM app.ResponsibilityRole x
                  WHERE x.FrameworkCode = r.FrameworkCode AND x.RoleCode = r.RoleCode);
GO

IF OBJECT_ID(N'app.ResponsibilityMatrix', N'U') IS NULL
    CREATE TABLE app.ResponsibilityMatrix (
        ResponsibilityMatrixId INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_ResponsibilityMatrix PRIMARY KEY,
        ProjectId     INT NOT NULL CONSTRAINT FK_ResponsibilityMatrix_Project REFERENCES app.Project (ProjectId),
        Name          NVARCHAR(100) NOT NULL,
        FrameworkCode NVARCHAR(16) NOT NULL
            CONSTRAINT FK_ResponsibilityMatrix_Framework REFERENCES app.ResponsibilityFramework (FrameworkCode),
        RowKind       NVARCHAR(16) NOT NULL
            CONSTRAINT CK_ResponsibilityMatrix_RowKind CHECK (RowKind IN (N'WbsItem', N'Decision')),
        CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_ResponsibilityMatrix_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy     INT NOT NULL,
        UpdatedAtUtc  DATETIME2 NULL,
        UpdatedBy     INT NULL,
        IsDeleted     BIT NOT NULL CONSTRAINT DF_ResponsibilityMatrix_IsDeleted DEFAULT 0,
        RowVer        ROWVERSION NOT NULL,
        CONSTRAINT UX_ResponsibilityMatrix_Id_Project UNIQUE (ResponsibilityMatrixId, ProjectId),
        CONSTRAINT UX_ResponsibilityMatrix_Shape UNIQUE (ResponsibilityMatrixId, ProjectId, FrameworkCode, RowKind)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ResponsibilityMatrix_Project_Name'
                 AND object_id = OBJECT_ID(N'app.ResponsibilityMatrix'))
    CREATE UNIQUE INDEX UX_ResponsibilityMatrix_Project_Name
        ON app.ResponsibilityMatrix (ProjectId, Name) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.ResponsibilityMember', N'U') IS NULL
    CREATE TABLE app.ResponsibilityMember (
        ResponsibilityMatrixId INT NOT NULL,
        ProjectId     INT NOT NULL,
        StakeholderId INT NOT NULL,
        SortOrder     INT NOT NULL,
        CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_ResponsibilityMember_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy     INT NOT NULL,
        CONSTRAINT PK_ResponsibilityMember PRIMARY KEY (ResponsibilityMatrixId, StakeholderId),
        CONSTRAINT FK_ResponsibilityMember_Matrix FOREIGN KEY (ResponsibilityMatrixId, ProjectId)
            REFERENCES app.ResponsibilityMatrix (ResponsibilityMatrixId, ProjectId),
        CONSTRAINT FK_ResponsibilityMember_Stakeholder FOREIGN KEY (StakeholderId, ProjectId)
            REFERENCES app.Stakeholder (StakeholderId, ProjectId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ResponsibilityMember_Stakeholder'
                 AND object_id = OBJECT_ID(N'app.ResponsibilityMember'))
    CREATE INDEX IX_ResponsibilityMember_Stakeholder ON app.ResponsibilityMember (StakeholderId);
GO

IF OBJECT_ID(N'app.ResponsibilityAssignment', N'U') IS NULL
    CREATE TABLE app.ResponsibilityAssignment (
        ResponsibilityAssignmentId INT IDENTITY(1, 1) NOT NULL
            CONSTRAINT PK_ResponsibilityAssignment PRIMARY KEY,
        ResponsibilityMatrixId INT NOT NULL,
        ProjectId        INT NOT NULL,
        FrameworkCode    NVARCHAR(16) NOT NULL,
        RowKind          NVARCHAR(16) NOT NULL,
        KeyDeliverableId INT NULL,
        DecisionId       INT NULL,
        StakeholderId    INT NOT NULL,
        RoleCode         NVARCHAR(24) NOT NULL,
        CreatedAtUtc     DATETIME2 NOT NULL CONSTRAINT DF_ResponsibilityAssignment_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy        INT NOT NULL,
        UpdatedAtUtc     DATETIME2 NULL,
        UpdatedBy        INT NULL,
        RowVer           ROWVERSION NOT NULL,
        CONSTRAINT CK_ResponsibilityAssignment_Row CHECK (
            (RowKind = N'WbsItem' AND KeyDeliverableId IS NOT NULL AND DecisionId IS NULL)
            OR (RowKind = N'Decision' AND DecisionId IS NOT NULL AND KeyDeliverableId IS NULL)),
        CONSTRAINT FK_ResponsibilityAssignment_Matrix
            FOREIGN KEY (ResponsibilityMatrixId, ProjectId, FrameworkCode, RowKind)
            REFERENCES app.ResponsibilityMatrix (ResponsibilityMatrixId, ProjectId, FrameworkCode, RowKind),
        CONSTRAINT FK_ResponsibilityAssignment_Role FOREIGN KEY (FrameworkCode, RoleCode)
            REFERENCES app.ResponsibilityRole (FrameworkCode, RoleCode),
        CONSTRAINT FK_ResponsibilityAssignment_Member FOREIGN KEY (ResponsibilityMatrixId, StakeholderId)
            REFERENCES app.ResponsibilityMember (ResponsibilityMatrixId, StakeholderId),
        CONSTRAINT FK_ResponsibilityAssignment_KeyDeliverable FOREIGN KEY (KeyDeliverableId, ProjectId)
            REFERENCES app.KeyDeliverable (KeyDeliverableId, ProjectId),
        CONSTRAINT FK_ResponsibilityAssignment_Decision FOREIGN KEY (DecisionId, ProjectId)
            REFERENCES app.Decision (DecisionId, ProjectId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ResponsibilityAssignment_WbsCell'
                 AND object_id = OBJECT_ID(N'app.ResponsibilityAssignment'))
    CREATE UNIQUE INDEX UX_ResponsibilityAssignment_WbsCell
        ON app.ResponsibilityAssignment (ResponsibilityMatrixId, KeyDeliverableId, StakeholderId)
        WHERE KeyDeliverableId IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ResponsibilityAssignment_DecisionCell'
                 AND object_id = OBJECT_ID(N'app.ResponsibilityAssignment'))
    CREATE UNIQUE INDEX UX_ResponsibilityAssignment_DecisionCell
        ON app.ResponsibilityAssignment (ResponsibilityMatrixId, DecisionId, StakeholderId)
        WHERE DecisionId IS NOT NULL;
GO
