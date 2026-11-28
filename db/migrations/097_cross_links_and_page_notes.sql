-- 097_cross_links_and_page_notes.sql — 1-to-1 Cross-Links ("portals", app.CrossLink) and
-- Small Page Notes (app.PageNote) per ADR-0074.
-- Zero raw URLs and zero raw viewport pixel coordinates: endpoints store structured allowlisted
-- (ModuleKey, ProjectId, EntityId, SubEntityId, AnchorKind, AnchorKey) tuples resolved live in SQL.
-- Additive and idempotent.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.CrossLink', N'U') IS NULL
BEGIN
    CREATE TABLE app.CrossLink (
        CrossLinkId     INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_CrossLink PRIMARY KEY,
        EndAModule      NVARCHAR(40)  NOT NULL,
        EndAProjectId   INT           NULL
            CONSTRAINT FK_CrossLink_EndAProject REFERENCES app.Project (ProjectId),
        EndAEntityId    INT           NULL,
        EndASubEntityId INT           NULL,
        EndAAnchorKind  NVARCHAR(24)  NOT NULL,
        EndAAnchorKey   NVARCHAR(80)  NULL,
        EndALabel       NVARCHAR(120) NOT NULL,
        EndBModule      NVARCHAR(40)  NOT NULL,
        EndBProjectId   INT           NULL
            CONSTRAINT FK_CrossLink_EndBProject REFERENCES app.Project (ProjectId),
        EndBEntityId    INT           NULL,
        EndBSubEntityId INT           NULL,
        EndBAnchorKind  NVARCHAR(24)  NOT NULL,
        EndBAnchorKey   NVARCHAR(80)  NULL,
        EndBLabel       NVARCHAR(120) NOT NULL,
        LinkTitle       NVARCHAR(120) NOT NULL,
        NoteText        NVARCHAR(500) NULL,
        Color           NVARCHAR(20)  NOT NULL
            CONSTRAINT DF_CrossLink_Color DEFAULT N'yellow',
        IsDeleted       BIT           NOT NULL
            CONSTRAINT DF_CrossLink_IsDeleted DEFAULT 0,
        DeletedAtUtc    DATETIME2     NULL,
        DeletedBy       INT           NULL
            CONSTRAINT FK_CrossLink_DeletedBy REFERENCES auth.[User] (UserId),
        CreatedAtUtc    DATETIME2     NOT NULL
            CONSTRAINT DF_CrossLink_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy       INT           NOT NULL
            CONSTRAINT FK_CrossLink_CreatedBy REFERENCES auth.[User] (UserId),
        UpdatedAtUtc    DATETIME2     NULL,
        UpdatedBy       INT           NULL
            CONSTRAINT FK_CrossLink_UpdatedBy REFERENCES auth.[User] (UserId),
        RowVer          ROWVERSION    NOT NULL,
        CONSTRAINT CK_CrossLink_EndAModule CHECK (
            EndAModule IN (
                N'dashboard', N'reports', N'project-overview', N'objectives', N'requirements',
                N'deliverables', N'deliverables-canvas', N'deliverables-gantt',
                N'stakeholders', N'stakeholders-matrix', N'responsibility', N'suppliers',
                N'keywords', N'daily-activity', N'todo', N'calendar',
                N'questions-answers', N'parking-lot', N'assumptions-constraints', N'risks-issues',
                N'decisions', N'whiteboard', N'bpmn', N'meetings', N'board', N'checklists', N'note',
                N'financials-budget', N'financials-monitoring', N'financials-documents',
                N'financials-settings', N'financials-project-math', N'financials-sheet'
            )
        ),
        CONSTRAINT CK_CrossLink_EndBModule CHECK (
            EndBModule IN (
                N'dashboard', N'reports', N'project-overview', N'objectives', N'requirements',
                N'deliverables', N'deliverables-canvas', N'deliverables-gantt',
                N'stakeholders', N'stakeholders-matrix', N'responsibility', N'suppliers',
                N'keywords', N'daily-activity', N'todo', N'calendar',
                N'questions-answers', N'parking-lot', N'assumptions-constraints', N'risks-issues',
                N'decisions', N'whiteboard', N'bpmn', N'meetings', N'board', N'checklists', N'note',
                N'financials-budget', N'financials-monitoring', N'financials-documents',
                N'financials-settings', N'financials-project-math', N'financials-sheet'
            )
        ),
        CONSTRAINT CK_CrossLink_AnchorKind CHECK (
            EndAAnchorKind IN (N'page', N'section', N'record', N'subrecord')
            AND EndBAnchorKind IN (N'page', N'section', N'record', N'subrecord')
        ),
        CONSTRAINT CK_CrossLink_AnchorKeys CHECK (
            (EndAAnchorKey IS NULL OR (LEN(EndAAnchorKey) BETWEEN 1 AND 80 AND EndAAnchorKey COLLATE Latin1_General_BIN2 NOT LIKE N'%[^-a-z0-9:_]%'))
            AND (EndBAnchorKey IS NULL OR (LEN(EndBAnchorKey) BETWEEN 1 AND 80 AND EndBAnchorKey COLLATE Latin1_General_BIN2 NOT LIKE N'%[^-a-z0-9:_]%'))
        ),
        CONSTRAINT CK_CrossLink_PositiveIds CHECK (
            (EndAEntityId IS NULL OR EndAEntityId > 0)
            AND (EndASubEntityId IS NULL OR EndASubEntityId > 0)
            AND (EndBEntityId IS NULL OR EndBEntityId > 0)
            AND (EndBSubEntityId IS NULL OR EndBSubEntityId > 0)
        ),
        CONSTRAINT CK_CrossLink_Color CHECK (
            Color IN (N'yellow', N'blue', N'green', N'orange', N'purple', N'gray')
        ),
        CONSTRAINT CK_CrossLink_Lengths CHECK (
            LEN(LTRIM(RTRIM(LinkTitle))) BETWEEN 1 AND 120
            AND LEN(LTRIM(RTRIM(EndALabel))) BETWEEN 1 AND 120
            AND LEN(LTRIM(RTRIM(EndBLabel))) BETWEEN 1 AND 120
            AND (NoteText IS NULL OR LEN(NoteText) <= 500)
        ),
        CONSTRAINT CK_CrossLink_DistinctEnds CHECK (
            NOT (
                EndAModule = EndBModule
                AND ISNULL(EndAProjectId, -1) = ISNULL(EndBProjectId, -1)
                AND ISNULL(EndAEntityId, -1) = ISNULL(EndBEntityId, -1)
                AND ISNULL(EndASubEntityId, -1) = ISNULL(EndBSubEntityId, -1)
                AND ISNULL(EndAAnchorKey, N'') = ISNULL(EndBAnchorKey, N'')
            )
        )
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CrossLink_EndA' AND object_id = OBJECT_ID(N'app.CrossLink'))
    CREATE INDEX IX_CrossLink_EndA
        ON app.CrossLink (EndAModule, EndAProjectId, EndAEntityId)
        WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CrossLink_EndB' AND object_id = OBJECT_ID(N'app.CrossLink'))
    CREATE INDEX IX_CrossLink_EndB
        ON app.CrossLink (EndBModule, EndBProjectId, EndBEntityId)
        WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CrossLink_EndAEntity' AND object_id = OBJECT_ID(N'app.CrossLink'))
    CREATE INDEX IX_CrossLink_EndAEntity
        ON app.CrossLink (EndAModule, EndAEntityId)
        WHERE IsDeleted = 0 AND EndAEntityId IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CrossLink_EndBEntity' AND object_id = OBJECT_ID(N'app.CrossLink'))
    CREATE INDEX IX_CrossLink_EndBEntity
        ON app.CrossLink (EndBModule, EndBEntityId)
        WHERE IsDeleted = 0 AND EndBEntityId IS NOT NULL;
GO

IF OBJECT_ID(N'app.PageNote', N'U') IS NULL
BEGIN
    CREATE TABLE app.PageNote (
        PageNoteId   INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_PageNote PRIMARY KEY,
        ModuleKey    NVARCHAR(40)   NOT NULL,
        ProjectId    INT            NULL
            CONSTRAINT FK_PageNote_Project REFERENCES app.Project (ProjectId),
        EntityId     INT            NULL,
        SubEntityId  INT            NULL,
        AnchorKind   NVARCHAR(24)   NOT NULL,
        AnchorKey    NVARCHAR(80)   NULL,
        AnchorLabel  NVARCHAR(120)  NULL,
        Body         NVARCHAR(1000) NOT NULL,
        Color        NVARCHAR(20)   NOT NULL
            CONSTRAINT DF_PageNote_Color DEFAULT N'yellow',
        IsDeleted    BIT            NOT NULL
            CONSTRAINT DF_PageNote_IsDeleted DEFAULT 0,
        DeletedAtUtc DATETIME2      NULL,
        DeletedBy    INT            NULL
            CONSTRAINT FK_PageNote_DeletedBy REFERENCES auth.[User] (UserId),
        CreatedAtUtc DATETIME2      NOT NULL
            CONSTRAINT DF_PageNote_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT            NOT NULL
            CONSTRAINT FK_PageNote_CreatedBy REFERENCES auth.[User] (UserId),
        UpdatedAtUtc DATETIME2      NULL,
        UpdatedBy    INT            NULL
            CONSTRAINT FK_PageNote_UpdatedBy REFERENCES auth.[User] (UserId),
        RowVer       ROWVERSION     NOT NULL,
        CONSTRAINT CK_PageNote_Module CHECK (
            ModuleKey IN (
                N'dashboard', N'reports', N'project-overview', N'objectives', N'requirements',
                N'deliverables', N'deliverables-canvas', N'deliverables-gantt',
                N'stakeholders', N'stakeholders-matrix', N'responsibility', N'suppliers',
                N'keywords', N'daily-activity', N'todo', N'calendar',
                N'questions-answers', N'parking-lot', N'assumptions-constraints', N'risks-issues',
                N'decisions', N'whiteboard', N'bpmn', N'meetings', N'board', N'checklists', N'note',
                N'financials-budget', N'financials-monitoring', N'financials-documents',
                N'financials-settings', N'financials-project-math', N'financials-sheet'
            )
        ),
        CONSTRAINT CK_PageNote_AnchorKind CHECK (
            AnchorKind IN (N'page', N'section', N'record', N'subrecord')
        ),
        CONSTRAINT CK_PageNote_AnchorKey CHECK (
            AnchorKey IS NULL OR (LEN(AnchorKey) BETWEEN 1 AND 80 AND AnchorKey COLLATE Latin1_General_BIN2 NOT LIKE N'%[^-a-z0-9:_]%')
        ),
        CONSTRAINT CK_PageNote_PositiveIds CHECK (
            (EntityId IS NULL OR EntityId > 0)
            AND (SubEntityId IS NULL OR SubEntityId > 0)
        ),
        CONSTRAINT CK_PageNote_Color CHECK (
            Color IN (N'yellow', N'blue', N'green', N'orange', N'purple', N'gray')
        ),
        CONSTRAINT CK_PageNote_BodyLen CHECK (
            LEN(LTRIM(RTRIM(Body))) BETWEEN 1 AND 1000
            AND (AnchorLabel IS NULL OR LEN(AnchorLabel) <= 120)
        )
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PageNote_Location' AND object_id = OBJECT_ID(N'app.PageNote'))
    CREATE INDEX IX_PageNote_Location
        ON app.PageNote (ModuleKey, ProjectId, EntityId)
        WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PageNote_Entity' AND object_id = OBJECT_ID(N'app.PageNote'))
    CREATE INDEX IX_PageNote_Entity
        ON app.PageNote (ModuleKey, EntityId)
        WHERE IsDeleted = 0 AND EntityId IS NOT NULL;
GO
