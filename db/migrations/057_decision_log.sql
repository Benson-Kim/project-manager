-- 057_decision_log.sql — the project decision log (client feedback 2026-11-03, ADR-0055).
--   app.Decision records one decision per row, cited by a per-project code the client writes as
--     DEC-001: [DecisionNumber] is the number behind it, assigned by usp_Decision_Create under the
--     app.Project (UPDLOCK, HOLDLOCK) every project-scoped write already takes.
--     UQ_Decision_Number is unfiltered on purpose, unlike the filtered uniques elsewhere in this
--     schema: a decision log is a citable record, so a number a deleted decision used is never
--     handed to another one. DEC-004 in a meeting's minutes means one decision forever.
--   [Status] is bound to the managed list 'decision.status' and stored as text, like every other
--     status in this schema. [SupersededByDecisionId] is separate data, not derived from the label:
--     a decision can be marked overturned before anyone knows what replaced it, and no code reads
--     a status label by name, so an Admin may rename all three (ADR-0022).
--     It is held inside its own project by a composite foreign key, and CK_Decision_NotSelf stops a
--     decision superseding itself. A chain longer than one link is allowed and is the truth of how
--     decisions actually supersede each other; the write proc refuses a cycle under the lock.
--   Impacted areas and the stakeholders consulted are sets the decision owns, not entities of their
--     own: they carry no RowVer and no soft delete, and each save replaces the whole set inside the
--     decision's transaction. They have no procs and no permission module of their own.
--     Both link tables carry ProjectId so each end is held inside the decision's project by a
--     composite foreign key, the way app.KeyDeliverableDependency (044) holds both of its ends,
--     rather than by a check the proc could forget.
--     app.DecisionImpactedArea stores the label, as every other list-bound value in this schema
--     does, so a rename reaches it through the cascade in dbo.usp_LookupList_Set. The list editor
--     already refuses two options with one label, so that cascade can never collide with
--     UQ_DecisionImpactedArea_Pair.
--     The links survive a soft delete, so restoring a decision restores what it touched.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.Decision', N'U') IS NULL
BEGIN
    CREATE TABLE app.Decision (
        DecisionId             INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_Decision PRIMARY KEY,
        ProjectId              INT NOT NULL
            CONSTRAINT FK_Decision_Project REFERENCES app.Project (ProjectId),
        DecisionNumber         INT NOT NULL,
        Title                  NVARCHAR(255) NOT NULL,
        DateLogged             DATETIME2 NOT NULL,
        OwnerStakeholderId     INT NULL,
        [Status]               NVARCHAR(50) NULL,
        ProblemContext         NVARCHAR(MAX) NULL,
        OptionsConsidered      NVARCHAR(MAX) NULL,
        Rationale              NVARCHAR(MAX) NULL,
        NextSteps              NVARCHAR(MAX) NULL,
        SupersededByDecisionId INT NULL,
        IsDeleted              BIT NOT NULL
            CONSTRAINT DF_Decision_IsDeleted DEFAULT (0),
        DeletedAtUtc           DATETIME2 NULL,
        DeletedBy              INT NULL,
        CreatedAtUtc           DATETIME2 NOT NULL
            CONSTRAINT DF_Decision_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy              INT NOT NULL,
        UpdatedAtUtc           DATETIME2 NULL,
        UpdatedBy              INT NULL,
        RowVer                 ROWVERSION,
        CONSTRAINT CK_Decision_Number CHECK (DecisionNumber >= 1),
        CONSTRAINT CK_Decision_NotSelf CHECK (SupersededByDecisionId <> DecisionId)
    );

    -- A decision's code is never reused, so this unique is not filtered on IsDeleted.
    CREATE UNIQUE INDEX UQ_Decision_Number ON app.Decision (ProjectId, DecisionNumber);

    -- Referenced by the composite foreign keys below, so every end stays in one project.
    CREATE UNIQUE INDEX UX_Decision_Id_Project ON app.Decision (DecisionId, ProjectId);

    ALTER TABLE app.Decision ADD CONSTRAINT FK_Decision_OwnerStakeholder
        FOREIGN KEY (OwnerStakeholderId, ProjectId)
        REFERENCES app.Stakeholder (StakeholderId, ProjectId);
    ALTER TABLE app.Decision ADD CONSTRAINT FK_Decision_SupersededBy
        FOREIGN KEY (SupersededByDecisionId, ProjectId)
        REFERENCES app.Decision (DecisionId, ProjectId);

    -- The register, newest decision first, and the owner's name joined in.
    CREATE INDEX IX_Decision_Project ON app.Decision (ProjectId, DateLogged DESC)
        INCLUDE (Title, [Status], OwnerStakeholderId, DecisionNumber);
END;
GO

IF OBJECT_ID(N'app.DecisionImpactedArea', N'U') IS NULL
BEGIN
    CREATE TABLE app.DecisionImpactedArea (
        DecisionImpactedAreaId INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_DecisionImpactedArea PRIMARY KEY,
        DecisionId             INT NOT NULL,
        ProjectId              INT NOT NULL
            CONSTRAINT FK_DecisionImpactedArea_Project REFERENCES app.Project (ProjectId),
        Label                  NVARCHAR(50) NOT NULL,
        CreatedAtUtc           DATETIME2 NOT NULL
            CONSTRAINT DF_DecisionImpactedArea_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy              INT NOT NULL,
        CONSTRAINT FK_DecisionImpactedArea_Decision
            FOREIGN KEY (DecisionId, ProjectId)
            REFERENCES app.Decision (DecisionId, ProjectId)
    );

    CREATE UNIQUE INDEX UQ_DecisionImpactedArea_Pair
        ON app.DecisionImpactedArea (DecisionId, Label);

    -- "Which decisions touched Budget" (usp_Decision_List @ImpactedArea) reads the label first.
    CREATE INDEX IX_DecisionImpactedArea_Project_Label
        ON app.DecisionImpactedArea (ProjectId, Label) INCLUDE (DecisionId);
END;
GO

IF OBJECT_ID(N'app.DecisionStakeholder', N'U') IS NULL
BEGIN
    CREATE TABLE app.DecisionStakeholder (
        DecisionStakeholderId INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_DecisionStakeholder PRIMARY KEY,
        DecisionId            INT NOT NULL,
        ProjectId             INT NOT NULL
            CONSTRAINT FK_DecisionStakeholder_Project REFERENCES app.Project (ProjectId),
        StakeholderId         INT NOT NULL,
        CreatedAtUtc          DATETIME2 NOT NULL
            CONSTRAINT DF_DecisionStakeholder_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy             INT NOT NULL,
        CONSTRAINT FK_DecisionStakeholder_Decision
            FOREIGN KEY (DecisionId, ProjectId)
            REFERENCES app.Decision (DecisionId, ProjectId),
        CONSTRAINT FK_DecisionStakeholder_Stakeholder
            FOREIGN KEY (StakeholderId, ProjectId)
            REFERENCES app.Stakeholder (StakeholderId, ProjectId)
    );

    CREATE UNIQUE INDEX UQ_DecisionStakeholder_Pair
        ON app.DecisionStakeholder (DecisionId, StakeholderId);
END;
GO

DECLARE @Lists TABLE (ListKey NVARCHAR(64));
INSERT INTO @Lists (ListKey) VALUES
    (N'decision.status'),
    (N'decision.impacted-area');

MERGE app.LookupList AS t
USING (SELECT ListKey FROM @Lists) AS s
ON t.ListKey = s.ListKey
WHEN NOT MATCHED THEN INSERT (ListKey) VALUES (s.ListKey);
GO

-- Nothing is locked: no code reads a decision's status or impacted area by name, so every option
-- here can be renamed, reordered or retired by an Admin (src/tests/lookup-lists.test.ts).
DECLARE @Seed TABLE (ListKey NVARCHAR(64), Label NVARCHAR(50), SortOrder INT, IsLocked BIT);
INSERT INTO @Seed (ListKey, Label, SortOrder, IsLocked) VALUES
    (N'decision.status', N'Proposed', 1, 0),
    (N'decision.status', N'Approved', 2, 0),
    (N'decision.status', N'Overturned', 3, 0),
    (N'decision.impacted-area', N'Scope', 1, 0),
    (N'decision.impacted-area', N'Budget', 2, 0),
    (N'decision.impacted-area', N'Timeline', 3, 0),
    (N'decision.impacted-area', N'Architecture', 4, 0),
    (N'decision.impacted-area', N'User experience', 5, 0);

MERGE app.LookupOption AS t
USING @Seed AS s
ON t.ListKey = s.ListKey AND t.Label = s.Label
WHEN NOT MATCHED THEN INSERT (ListKey, Label, SortOrder, IsLocked, Color, CreatedBy)
                      VALUES (s.ListKey, s.Label, s.SortOrder, s.IsLocked,
                              CASE s.Label
                                  WHEN N'Proposed'        THEN 'blue'
                                  WHEN N'Approved'        THEN 'green'
                                  WHEN N'Overturned'      THEN 'red'
                                  WHEN N'Scope'           THEN 'purple'
                                  WHEN N'Budget'          THEN 'orange'
                                  WHEN N'Timeline'        THEN 'yellow'
                                  WHEN N'Architecture'    THEN 'blue'
                                  WHEN N'User experience' THEN 'green'
                              END, 0);
GO
