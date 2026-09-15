-- 003_domain_schema.sql — full domain schema migrated from Access_database.mdb
-- (module database-schema-and-procs, issue #3). Source of truth:
-- docs/source/analysis/access-database.md §2 (schemas) / §3 (relationships) and docs/PLAN.md §2.
-- Every entity table follows STANDARDS §2.2: PK <Entity>Id INT IDENTITY, soft delete,
-- audit columns, RowVer ROWVERSION, FK + list-proc indexes. Idempotent: safe to re-run.
-- Structural decisions (recorded in MR + db/README.md):
--   * tblTodoList split: TodoItem (core) + TodoAlert (1:1 alert engine, row exists only when the
--     source row had IsAlert = 1); the dual-purpose ProjectActivityID becomes two nullable FKs.
--   * tblFinancialDocuments → FinancialDocumentType lookup (ActivityStatus-style, no soft delete);
--     tblProjectFinancialDocuments → FinancialDocument junction (IsRequired, ReasonNotCreated).
--   * tblMeetingParticipants gets a surrogate PK; Apology TEXT → IsApology BIT;
--     Meeting ID 0 (nonexistent meeting) → NULL.
--   * ProjectAssignee is new (req 0.3 one-or-many PMs/sponsors/BAs); UserId FK lands with #4.
--   * Access DATETIME time-of-day fields (meeting StartTime/EndTime, alert AlertTime) → TIME(0).
--   * tblDailyActivityList.Attachment / complex columns dropped — app.FileAttachment arrives
--     with module #16/#22 (file-storage).
USE ProjectManager;
GO

-- FinancialDocumentType — MSSS document-type lookup (tblFinancialDocuments, recovered).
IF OBJECT_ID(N'app.FinancialDocumentType', N'U') IS NULL
BEGIN
    CREATE TABLE app.FinancialDocumentType (
        FinancialDocumentTypeId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FinancialDocumentType PRIMARY KEY,
        DocumentType            NVARCHAR(255) NOT NULL CONSTRAINT UQ_FinancialDocumentType_DocumentType UNIQUE,
        SortOrder               INT NOT NULL CONSTRAINT DF_FinancialDocumentType_SortOrder DEFAULT 0
    );
END;
GO
-- Project (source: tblProjectFramework)
IF OBJECT_ID(N'app.Project', N'U') IS NULL
BEGIN
    CREATE TABLE app.Project (
    ProjectId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Project PRIMARY KEY,
    [ProjectName] NVARCHAR(255) NOT NULL,
    [ProjectManager] NVARCHAR(255) NULL,
    [BusinessAnalyst] NVARCHAR(255) NULL,
    [ProjectDocs] NVARCHAR(MAX) NULL,
    [ProjectSponsor] NVARCHAR(255) NULL,
    [DateOfProject] DATETIME2 NULL,
    [ProblemStatement] NVARCHAR(MAX) NULL,
    [CurrentState] NVARCHAR(MAX) NULL,
    [FutureState] NVARCHAR(MAX) NULL,
    [UserImpact] NVARCHAR(MAX) NULL,
    [Mandate] NVARCHAR(255) NULL,
    [ProjectStatusCom] NVARCHAR(MAX) NULL,
    [ExistBusMod] NVARCHAR(255) NULL,
    [A1] BIT NOT NULL CONSTRAINT DF_Project_A1 DEFAULT 0,
    [DA] BIT NOT NULL CONSTRAINT DF_Project_DA DEFAULT 0,
    [DAS] BIT NOT NULL CONSTRAINT DF_Project_DAS DEFAULT 0,
    [PurchaseOrder] BIT NOT NULL CONSTRAINT DF_Project_PurchaseOrder DEFAULT 0,
    [Requisition] BIT NOT NULL CONSTRAINT DF_Project_Requisition DEFAULT 0,
    [DO] BIT NOT NULL CONSTRAINT DF_Project_DO DEFAULT 0,
    [FinancingSource] NVARCHAR(255) NULL,
    [FinancingCost] MONEY NULL,
    [RecurrentCost] MONEY NULL,
    [PurchaseEquipment] BIT NOT NULL CONSTRAINT DF_Project_PurchaseEquipment DEFAULT 0,
    [EquipmentNotes] NVARCHAR(MAX) NULL,
    [StartDate] DATETIME2 NULL,
    [EndDate] DATETIME2 NULL,
    [SimilarProject] BIT NOT NULL CONSTRAINT DF_Project_SimilarProject DEFAULT 0,
    [ProjectPriority] NVARCHAR(50) NULL,
    [EstimatedCompletionDate] DATETIME2 NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_Project_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_Project_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
-- ProjectAssignee (source: (new — req 0.3 one-or-many PMs/sponsors/BAs))
IF OBJECT_ID(N'app.ProjectAssignee', N'U') IS NULL
BEGIN
    CREATE TABLE app.ProjectAssignee (
    ProjectAssigneeId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ProjectAssignee PRIMARY KEY,
    [ProjectId] INT NOT NULL CONSTRAINT FK_ProjectAssignee_Project_ProjectId REFERENCES app.Project(ProjectId),
    [Role] NVARCHAR(50) NOT NULL,
    [PersonName] NVARCHAR(255) NOT NULL,
    [UserId] INT NULL,
    CONSTRAINT CK_ProjectAssignee_Role CHECK (Role IN (N'ProjectManager', N'Sponsor', N'BusinessAnalyst')),
    IsDeleted     BIT NOT NULL CONSTRAINT DF_ProjectAssignee_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_ProjectAssignee_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ProjectAssignee_ProjectId' AND object_id = OBJECT_ID(N'app.ProjectAssignee'))
    CREATE INDEX IX_ProjectAssignee_ProjectId ON app.ProjectAssignee (ProjectId, IsDeleted) INCLUDE ([Role], [PersonName]);
GO
-- Stakeholder (source: tblStakeholders)
IF OBJECT_ID(N'app.Stakeholder', N'U') IS NULL
BEGIN
    CREATE TABLE app.Stakeholder (
    StakeholderId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Stakeholder PRIMARY KEY,
    [ProjectId] INT NOT NULL CONSTRAINT FK_Stakeholder_Project_ProjectId REFERENCES app.Project(ProjectId),
    [FirstName] NVARCHAR(255) NOT NULL,
    [LastName] NVARCHAR(255) NULL,
    [DepartmentOrganization] NVARCHAR(255) NULL,
    [ProjectRole] NVARCHAR(255) NULL,
    [RoleDescription] NVARCHAR(255) NULL,
    [PhoneNumber] NVARCHAR(255) NULL,
    [PhoneExt] NVARCHAR(255) NULL,
    [Mobile] NVARCHAR(255) NULL,
    [EmailAddress] NVARCHAR(255) NULL,
    [PhysicalLocation] NVARCHAR(255) NULL,
    [OrgTitle] NVARCHAR(255) NULL,
    [CommunicationPreference] NVARCHAR(255) NULL,
    [EngagementLevel] NVARCHAR(255) NULL,
    [AdditionalNotes] NVARCHAR(MAX) NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_Stakeholder_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_Stakeholder_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Stakeholder_ProjectId' AND object_id = OBJECT_ID(N'app.Stakeholder'))
    CREATE INDEX IX_Stakeholder_ProjectId ON app.Stakeholder (ProjectId, IsDeleted) INCLUDE ([FirstName], [LastName]);
GO
-- Supplier (source: tbl3rdPartySupplier)
IF OBJECT_ID(N'app.Supplier', N'U') IS NULL
BEGIN
    CREATE TABLE app.Supplier (
    SupplierId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Supplier PRIMARY KEY,
    [ProjectId] INT NOT NULL CONSTRAINT FK_Supplier_Project_ProjectId REFERENCES app.Project(ProjectId),
    [SupplierName] NVARCHAR(255) NOT NULL,
    [ContactPerson] NVARCHAR(255) NULL,
    [EmailAddress] NVARCHAR(255) NULL,
    [ContractStartDate] DATETIME2 NULL,
    [ContractEndDate] DATETIME2 NULL,
    [Rating] NVARCHAR(255) NULL,
    [Address] NVARCHAR(255) NULL,
    [ProvinceOrState] NVARCHAR(255) NULL,
    [Country] NVARCHAR(255) NULL,
    [PostalCode] NVARCHAR(255) NULL,
    [City] NVARCHAR(255) NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_Supplier_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_Supplier_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Supplier_ProjectId' AND object_id = OBJECT_ID(N'app.Supplier'))
    CREATE INDEX IX_Supplier_ProjectId ON app.Supplier (ProjectId, IsDeleted) INCLUDE ([SupplierName]);
GO
-- Keyword (source: tblAcronyms)
IF OBJECT_ID(N'app.Keyword', N'U') IS NULL
BEGIN
    CREATE TABLE app.Keyword (
    KeywordId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Keyword PRIMARY KEY,
    [ProjectId] INT NULL CONSTRAINT FK_Keyword_Project_ProjectId REFERENCES app.Project(ProjectId),
    [Acronym] NVARCHAR(255) NOT NULL,
    [Definition] NVARCHAR(255) NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_Keyword_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_Keyword_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Keyword_ProjectId' AND object_id = OBJECT_ID(N'app.Keyword'))
    CREATE INDEX IX_Keyword_ProjectId ON app.Keyword (ProjectId, IsDeleted) INCLUDE ([Acronym]);
GO
-- KeyDeliverable (source: tblKeyRequirementsDeliverable)
IF OBJECT_ID(N'app.KeyDeliverable', N'U') IS NULL
BEGIN
    CREATE TABLE app.KeyDeliverable (
    KeyDeliverableId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_KeyDeliverable PRIMARY KEY,
    [ProjectId] INT NULL CONSTRAINT FK_KeyDeliverable_Project_ProjectId REFERENCES app.Project(ProjectId),
    [KeyRequirement] NVARCHAR(MAX) NULL,
    [Deadline] DATETIME2 NULL,
    [AssignedToStakeholderId] INT NULL CONSTRAINT FK_KeyDeliverable_Stakeholder_AssignedToStakeholderId REFERENCES app.Stakeholder(StakeholderId),
    [Priority] NVARCHAR(255) NULL,
    [Status] NVARCHAR(255) NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_KeyDeliverable_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_KeyDeliverable_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_KeyDeliverable_ProjectId' AND object_id = OBJECT_ID(N'app.KeyDeliverable'))
    CREATE INDEX IX_KeyDeliverable_ProjectId ON app.KeyDeliverable (ProjectId, IsDeleted) INCLUDE ([Deadline], [Status]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_KeyDeliverable_AssignedToStakeholderId' AND object_id = OBJECT_ID(N'app.KeyDeliverable'))
    CREATE INDEX IX_KeyDeliverable_AssignedToStakeholderId ON app.KeyDeliverable ([AssignedToStakeholderId], IsDeleted);
GO
-- Objective (source: tblProjectObjectives)
IF OBJECT_ID(N'app.Objective', N'U') IS NULL
BEGIN
    CREATE TABLE app.Objective (
    ObjectiveId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Objective PRIMARY KEY,
    [ProjectId] INT NOT NULL CONSTRAINT FK_Objective_Project_ProjectId REFERENCES app.Project(ProjectId),
    [QMeasurable] NVARCHAR(255) NULL,
    [QSuccess] NVARCHAR(MAX) NULL,
    [QAlignmentStrategy] NVARCHAR(255) NULL,
    [ObjectiveText] NVARCHAR(MAX) NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_Objective_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_Objective_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Objective_ProjectId' AND object_id = OBJECT_ID(N'app.Objective'))
    CREATE INDEX IX_Objective_ProjectId ON app.Objective (ProjectId, IsDeleted);
GO
-- Meeting (source: tblMeetingMinutes (recovered))
IF OBJECT_ID(N'app.Meeting', N'U') IS NULL
BEGIN
    CREATE TABLE app.Meeting (
    MeetingId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Meeting PRIMARY KEY,
    [ProjectId] INT NULL CONSTRAINT FK_Meeting_Project_ProjectId REFERENCES app.Project(ProjectId),
    [Subject] NVARCHAR(255) NULL,
    [Description] NVARCHAR(MAX) NULL,
    [Location] NVARCHAR(255) NULL,
    [StartDate] DATETIME2 NULL,
    [StartTime] TIME(0) NULL,
    [EndTime] TIME(0) NULL,
    [Conclusion] NVARCHAR(MAX) NULL,
    [NextMeeting] DATETIME2 NULL,
    [FollowupAction] NVARCHAR(255) NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_Meeting_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_Meeting_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Meeting_ProjectId' AND object_id = OBJECT_ID(N'app.Meeting'))
    CREATE INDEX IX_Meeting_ProjectId ON app.Meeting (ProjectId, IsDeleted) INCLUDE ([Subject], [StartDate]);
GO
-- MeetingAgendaItem (source: tblMeetingAgenda)
IF OBJECT_ID(N'app.MeetingAgendaItem', N'U') IS NULL
BEGIN
    CREATE TABLE app.MeetingAgendaItem (
    MeetingAgendaItemId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MeetingAgendaItem PRIMARY KEY,
    [MeetingId] INT NULL CONSTRAINT FK_MeetingAgendaItem_Meeting_MeetingId REFERENCES app.Meeting(MeetingId),
    [AgendaItem] NVARCHAR(MAX) NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_MeetingAgendaItem_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_MeetingAgendaItem_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MeetingAgendaItem_MeetingId' AND object_id = OBJECT_ID(N'app.MeetingAgendaItem'))
    CREATE INDEX IX_MeetingAgendaItem_MeetingId ON app.MeetingAgendaItem ([MeetingId], IsDeleted);
GO
-- MeetingDiscussionPoint (source: tblMeetingDiscussionPoints)
IF OBJECT_ID(N'app.MeetingDiscussionPoint', N'U') IS NULL
BEGIN
    CREATE TABLE app.MeetingDiscussionPoint (
    MeetingDiscussionPointId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MeetingDiscussionPoint PRIMARY KEY,
    [AgendaItemId] INT NOT NULL CONSTRAINT FK_MeetingDiscussionPoint_MeetingAgendaItem_AgendaItemId REFERENCES app.MeetingAgendaItem(MeetingAgendaItemId),
    [DiscussionPoint] NVARCHAR(MAX) NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_MeetingDiscussionPoint_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_MeetingDiscussionPoint_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MeetingDiscussionPoint_AgendaItemId' AND object_id = OBJECT_ID(N'app.MeetingDiscussionPoint'))
    CREATE INDEX IX_MeetingDiscussionPoint_AgendaItemId ON app.MeetingDiscussionPoint ([AgendaItemId], IsDeleted);
GO
-- MeetingParticipant (source: tblMeetingParticipants)
IF OBJECT_ID(N'app.MeetingParticipant', N'U') IS NULL
BEGIN
    CREATE TABLE app.MeetingParticipant (
    MeetingParticipantId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MeetingParticipant PRIMARY KEY,
    [MeetingId] INT NULL CONSTRAINT FK_MeetingParticipant_Meeting_MeetingId REFERENCES app.Meeting(MeetingId),
    [StakeholderId] INT NOT NULL CONSTRAINT FK_MeetingParticipant_Stakeholder_StakeholderId REFERENCES app.Stakeholder(StakeholderId),
    [IsApology] BIT NOT NULL CONSTRAINT DF_MeetingParticipant_IsApology DEFAULT 0,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_MeetingParticipant_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_MeetingParticipant_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MeetingParticipant_MeetingId' AND object_id = OBJECT_ID(N'app.MeetingParticipant'))
    CREATE INDEX IX_MeetingParticipant_MeetingId ON app.MeetingParticipant ([MeetingId], IsDeleted);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MeetingParticipant_StakeholderId' AND object_id = OBJECT_ID(N'app.MeetingParticipant'))
    CREATE INDEX IX_MeetingParticipant_StakeholderId ON app.MeetingParticipant ([StakeholderId], IsDeleted);
GO
-- MeetingActionItem (source: tblMeetingActionItems)
IF OBJECT_ID(N'app.MeetingActionItem', N'U') IS NULL
BEGIN
    CREATE TABLE app.MeetingActionItem (
    MeetingActionItemId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MeetingActionItem PRIMARY KEY,
    [DiscussionPointId] INT NULL CONSTRAINT FK_MeetingActionItem_MeetingDiscussionPoint_DiscussionPointId REFERENCES app.MeetingDiscussionPoint(MeetingDiscussionPointId),
    [AgendaItemId] INT NULL CONSTRAINT FK_MeetingActionItem_MeetingAgendaItem_AgendaItemId REFERENCES app.MeetingAgendaItem(MeetingAgendaItemId),
    [Action] NVARCHAR(MAX) NULL,
    [AssignedToStakeholderId] INT NULL CONSTRAINT FK_MeetingActionItem_Stakeholder_AssignedToStakeholderId REFERENCES app.Stakeholder(StakeholderId),
    [DueDate] DATETIME2 NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_MeetingActionItem_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_MeetingActionItem_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MeetingActionItem_DiscussionPointId' AND object_id = OBJECT_ID(N'app.MeetingActionItem'))
    CREATE INDEX IX_MeetingActionItem_DiscussionPointId ON app.MeetingActionItem ([DiscussionPointId], IsDeleted);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MeetingActionItem_AgendaItemId' AND object_id = OBJECT_ID(N'app.MeetingActionItem'))
    CREATE INDEX IX_MeetingActionItem_AgendaItemId ON app.MeetingActionItem ([AgendaItemId], IsDeleted);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MeetingActionItem_AssignedToStakeholderId' AND object_id = OBJECT_ID(N'app.MeetingActionItem'))
    CREATE INDEX IX_MeetingActionItem_AssignedToStakeholderId ON app.MeetingActionItem ([AssignedToStakeholderId], IsDeleted);
GO
-- QuestionAnswer (source: tblInterviewQuestionsAnswers)
IF OBJECT_ID(N'app.QuestionAnswer', N'U') IS NULL
BEGIN
    CREATE TABLE app.QuestionAnswer (
    QuestionAnswerId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_QuestionAnswer PRIMARY KEY,
    [ProjectId] INT NULL CONSTRAINT FK_QuestionAnswer_Project_ProjectId REFERENCES app.Project(ProjectId),
    [Question] NVARCHAR(MAX) NULL,
    [Answer] NVARCHAR(MAX) NULL,
    [Category] NVARCHAR(255) NULL,
    [Priority] NVARCHAR(255) NULL,
    [AssignedTo] NVARCHAR(255) NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_QuestionAnswer_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_QuestionAnswer_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_QuestionAnswer_ProjectId' AND object_id = OBJECT_ID(N'app.QuestionAnswer'))
    CREATE INDEX IX_QuestionAnswer_ProjectId ON app.QuestionAnswer (ProjectId, IsDeleted);
GO
-- AssumptionConstraint (source: tblAssumptionsConstraints)
IF OBJECT_ID(N'app.AssumptionConstraint', N'U') IS NULL
BEGIN
    CREATE TABLE app.AssumptionConstraint (
    AssumptionConstraintId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AssumptionConstraint PRIMARY KEY,
    [ProjectId] INT NOT NULL CONSTRAINT FK_AssumptionConstraint_Project_ProjectId REFERENCES app.Project(ProjectId),
    [Type] NVARCHAR(255) NULL,
    [Description] NVARCHAR(MAX) NULL,
    [IsValidated] BIT NOT NULL CONSTRAINT DF_AssumptionConstraint_IsValidated DEFAULT 0,
    [Impact] NVARCHAR(255) NULL,
    [MitigationPlan] NVARCHAR(MAX) NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_AssumptionConstraint_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_AssumptionConstraint_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AssumptionConstraint_ProjectId' AND object_id = OBJECT_ID(N'app.AssumptionConstraint'))
    CREATE INDEX IX_AssumptionConstraint_ProjectId ON app.AssumptionConstraint (ProjectId, IsDeleted) INCLUDE ([Type]);
GO
-- RiskIssue (source: tblRisksIssuesTracker)
IF OBJECT_ID(N'app.RiskIssue', N'U') IS NULL
BEGIN
    CREATE TABLE app.RiskIssue (
    RiskIssueId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RiskIssue PRIMARY KEY,
    [ProjectId] INT NOT NULL CONSTRAINT FK_RiskIssue_Project_ProjectId REFERENCES app.Project(ProjectId),
    [Description] NVARCHAR(MAX) NULL,
    [Category] NVARCHAR(255) NULL,
    [DateIdentified] DATETIME2 NULL,
    [Status] NVARCHAR(255) NULL,
    [Priority] NVARCHAR(255) NULL,
    [Impact] NVARCHAR(255) NULL,
    [Probability] NVARCHAR(255) NULL,
    [MitigationPlan] NVARCHAR(MAX) NULL,
    [Owner] NVARCHAR(255) NULL,
    [DueDate] DATETIME2 NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_RiskIssue_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_RiskIssue_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RiskIssue_ProjectId' AND object_id = OBJECT_ID(N'app.RiskIssue'))
    CREATE INDEX IX_RiskIssue_ProjectId ON app.RiskIssue (ProjectId, IsDeleted) INCLUDE ([Status], [Priority]);
GO
-- Note (source: tblNotes)
IF OBJECT_ID(N'app.Note', N'U') IS NULL
BEGIN
    CREATE TABLE app.Note (
    NoteId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Note PRIMARY KEY,
    [ProjectId] INT NOT NULL CONSTRAINT FK_Note_Project_ProjectId REFERENCES app.Project(ProjectId),
    [Title] NVARCHAR(255) NULL,
    [Content] NVARCHAR(MAX) NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_Note_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_Note_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Note_ProjectId' AND object_id = OBJECT_ID(N'app.Note'))
    CREATE INDEX IX_Note_ProjectId ON app.Note (ProjectId, IsDeleted) INCLUDE ([Title]);
GO
-- NoteTab (source: (new — titled tabs per checklist rows 17-20))
IF OBJECT_ID(N'app.NoteTab', N'U') IS NULL
BEGIN
    CREATE TABLE app.NoteTab (
    NoteTabId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_NoteTab PRIMARY KEY,
    [NoteId] INT NOT NULL CONSTRAINT FK_NoteTab_Note_NoteId REFERENCES app.Note(NoteId),
    [Title] NVARCHAR(255) NULL,
    [Content] NVARCHAR(MAX) NULL,
    [SortOrder] INT NOT NULL CONSTRAINT DF_NoteTab_SortOrder DEFAULT 0,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_NoteTab_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_NoteTab_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_NoteTab_NoteId' AND object_id = OBJECT_ID(N'app.NoteTab'))
    CREATE INDEX IX_NoteTab_NoteId ON app.NoteTab ([NoteId], IsDeleted);
GO
-- ItResourceCategory (source: tblITResourcePlanning)
IF OBJECT_ID(N'app.ItResourceCategory', N'U') IS NULL
BEGIN
    CREATE TABLE app.ItResourceCategory (
    ItResourceCategoryId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ItResourceCategory PRIMARY KEY,
    [ProjectId] INT NOT NULL CONSTRAINT FK_ItResourceCategory_Project_ProjectId REFERENCES app.Project(ProjectId),
    [Resource] NVARCHAR(255) NOT NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_ItResourceCategory_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_ItResourceCategory_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ItResourceCategory_ProjectId' AND object_id = OBJECT_ID(N'app.ItResourceCategory'))
    CREATE INDEX IX_ItResourceCategory_ProjectId ON app.ItResourceCategory (ProjectId, IsDeleted) INCLUDE ([Resource]);
GO
-- ItResourceItem (source: tblITResourcePlanningDetails)
IF OBJECT_ID(N'app.ItResourceItem', N'U') IS NULL
BEGIN
    CREATE TABLE app.ItResourceItem (
    ItResourceItemId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ItResourceItem PRIMARY KEY,
    [ItResourceCategoryId] INT NOT NULL CONSTRAINT FK_ItResourceItem_ItResourceCategory_ItResourceCategoryId REFERENCES app.ItResourceCategory(ItResourceCategoryId),
    [DetailText] NVARCHAR(MAX) NULL,
    [Needed] BIT NOT NULL CONSTRAINT DF_ItResourceItem_Needed DEFAULT 0,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_ItResourceItem_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_ItResourceItem_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ItResourceItem_ItResourceCategoryId' AND object_id = OBJECT_ID(N'app.ItResourceItem'))
    CREATE INDEX IX_ItResourceItem_ItResourceCategoryId ON app.ItResourceItem ([ItResourceCategoryId], IsDeleted);
GO
-- Financial (source: tblFinancials)
IF OBJECT_ID(N'app.Financial', N'U') IS NULL
BEGIN
    CREATE TABLE app.Financial (
    FinancialId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Financial PRIMARY KEY,
    [ProjectId] INT NOT NULL CONSTRAINT FK_Financial_Project_ProjectId REFERENCES app.Project(ProjectId),
    [ProjectNumber] INT NULL,
    [Acquisition] NVARCHAR(255) NULL,
    [GlGrandLivre] NVARCHAR(255) NULL,
    [BudgetEnvelope] NVARCHAR(255) NULL,
    [Budget] MONEY NULL,
    [SpendBy] NVARCHAR(255) NULL,
    [RecurrentFees] MONEY NULL,
    [ContractTimeframe] NVARCHAR(255) NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_Financial_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_Financial_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Financial_ProjectId' AND object_id = OBJECT_ID(N'app.Financial'))
    CREATE INDEX IX_Financial_ProjectId ON app.Financial (ProjectId, IsDeleted) INCLUDE ([BudgetEnvelope]);
GO
-- FinancialDocument (source: tblProjectFinancialDocuments)
IF OBJECT_ID(N'app.FinancialDocument', N'U') IS NULL
BEGIN
    CREATE TABLE app.FinancialDocument (
    FinancialDocumentId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FinancialDocument PRIMARY KEY,
    [FinancialId] INT NOT NULL CONSTRAINT FK_FinancialDocument_Financial_FinancialId REFERENCES app.Financial(FinancialId),
    [FinancialDocumentTypeId] INT NOT NULL CONSTRAINT FK_FinancialDocument_FinancialDocumentType_FinancialDocumentTypeId REFERENCES app.FinancialDocumentType(FinancialDocumentTypeId),
    [IsRequired] BIT NOT NULL CONSTRAINT DF_FinancialDocument_IsRequired DEFAULT 0,
    [ReasonNotCreated] NVARCHAR(MAX) NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_FinancialDocument_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_FinancialDocument_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinancialDocument_FinancialId' AND object_id = OBJECT_ID(N'app.FinancialDocument'))
    CREATE INDEX IX_FinancialDocument_FinancialId ON app.FinancialDocument ([FinancialId], IsDeleted);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinancialDocument_FinancialDocumentTypeId' AND object_id = OBJECT_ID(N'app.FinancialDocument'))
    CREATE INDEX IX_FinancialDocument_FinancialDocumentTypeId ON app.FinancialDocument ([FinancialDocumentTypeId], IsDeleted);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_FinancialDocument_FinancialType' AND object_id = OBJECT_ID(N'app.FinancialDocument'))
    CREATE UNIQUE INDEX UQ_FinancialDocument_FinancialType ON app.FinancialDocument ([FinancialId], [FinancialDocumentTypeId]) WHERE IsDeleted = 0;
GO
-- ParkingLotItem (source: tblParkingLotItems)
IF OBJECT_ID(N'app.ParkingLotItem', N'U') IS NULL
BEGIN
    CREATE TABLE app.ParkingLotItem (
    ParkingLotItemId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ParkingLotItem PRIMARY KEY,
    [ProjectId] INT NOT NULL CONSTRAINT FK_ParkingLotItem_Project_ProjectId REFERENCES app.Project(ProjectId),
    [ParkingLotItem] NVARCHAR(255) NULL,
    [StakeholderId] INT NULL CONSTRAINT FK_ParkingLotItem_Stakeholder_StakeholderId REFERENCES app.Stakeholder(StakeholderId),
    [IsStrikethrough] BIT NOT NULL CONSTRAINT DF_ParkingLotItem_IsStrikethrough DEFAULT 0,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_ParkingLotItem_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_ParkingLotItem_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ParkingLotItem_ProjectId' AND object_id = OBJECT_ID(N'app.ParkingLotItem'))
    CREATE INDEX IX_ParkingLotItem_ProjectId ON app.ParkingLotItem (ProjectId, IsDeleted) INCLUDE ([ParkingLotItem]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ParkingLotItem_StakeholderId' AND object_id = OBJECT_ID(N'app.ParkingLotItem'))
    CREATE INDEX IX_ParkingLotItem_StakeholderId ON app.ParkingLotItem ([StakeholderId], IsDeleted);
GO
-- DailyActivity (source: tblDailyActivityList)
IF OBJECT_ID(N'app.DailyActivity', N'U') IS NULL
BEGIN
    CREATE TABLE app.DailyActivity (
    DailyActivityId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DailyActivity PRIMARY KEY,
    [ProjectId] INT NOT NULL CONSTRAINT FK_DailyActivity_Project_ProjectId REFERENCES app.Project(ProjectId),
    [ActivityStatusId] INT NULL CONSTRAINT FK_DailyActivity_ActivityStatus_ActivityStatusId REFERENCES app.ActivityStatus(ActivityStatusId),
    [Requester] NVARCHAR(255) NULL,
    [Task] NVARCHAR(MAX) NULL,
    [MyActivity] NVARCHAR(MAX) NULL,
    [ActivityDate] DATETIME2 NULL,
    [Comments] NVARCHAR(MAX) NULL,
    [RequestDate] DATETIME2 NULL,
    [Status] NVARCHAR(255) NULL,
    [CompleteDate] DATETIME2 NULL,
    [ContactMethod] NVARCHAR(255) NULL,
    [TimeSpent] INT NULL,
    [AssignedTo] NVARCHAR(255) NULL,
    [TaskType] NVARCHAR(255) NULL,
    [Progress] INT NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_DailyActivity_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_DailyActivity_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DailyActivity_ProjectId' AND object_id = OBJECT_ID(N'app.DailyActivity'))
    CREATE INDEX IX_DailyActivity_ProjectId ON app.DailyActivity (ProjectId, IsDeleted) INCLUDE ([RequestDate], [Status]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DailyActivity_ActivityStatusId' AND object_id = OBJECT_ID(N'app.DailyActivity'))
    CREATE INDEX IX_DailyActivity_ActivityStatusId ON app.DailyActivity ([ActivityStatusId], IsDeleted);
GO
-- TodoItem (source: tblTodoList (core; alert columns → TodoAlert))
IF OBJECT_ID(N'app.TodoItem', N'U') IS NULL
BEGIN
    CREATE TABLE app.TodoItem (
    TodoItemId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TodoItem PRIMARY KEY,
    [ProjectId] INT NULL CONSTRAINT FK_TodoItem_Project_ProjectId REFERENCES app.Project(ProjectId),
    [DailyActivityId] INT NULL CONSTRAINT FK_TodoItem_DailyActivity_DailyActivityId REFERENCES app.DailyActivity(DailyActivityId),
    [ProjectOrActivity] NVARCHAR(50) NULL,
    [TodoItem] NVARCHAR(255) NULL,
    [StartDate] DATETIME2 NULL,
    [DueDate] DATETIME2 NULL,
    [Priority] NVARCHAR(255) NULL,
    [Status] NVARCHAR(255) NULL,
    [Notes] NVARCHAR(MAX) NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_TodoItem_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_TodoItem_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TodoItem_ProjectId' AND object_id = OBJECT_ID(N'app.TodoItem'))
    CREATE INDEX IX_TodoItem_ProjectId ON app.TodoItem (ProjectId, IsDeleted) INCLUDE ([DueDate], [Status]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TodoItem_DailyActivityId' AND object_id = OBJECT_ID(N'app.TodoItem'))
    CREATE INDEX IX_TodoItem_DailyActivityId ON app.TodoItem ([DailyActivityId], IsDeleted);
GO
-- TodoAlert (source: tblTodoList (alert engine columns, 1:1))
IF OBJECT_ID(N'app.TodoAlert', N'U') IS NULL
BEGIN
    CREATE TABLE app.TodoAlert (
    TodoAlertId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TodoAlert PRIMARY KEY,
    [TodoItemId] INT NOT NULL CONSTRAINT FK_TodoAlert_TodoItem_TodoItemId REFERENCES app.TodoItem(TodoItemId),
    [AlertDay] DATETIME2 NULL,
    [AlertTime] TIME(0) NULL,
    [RepeatUnit] NVARCHAR(50) NULL,
    [RepeatInterval] INT NULL,
    [CurrentRepeatInterval] INT NULL,
    [SnoozeCount] INT NULL,
    [LastSnoozeTime] DATETIME2 NULL,
    [MaxSnoozeCount] INT NULL,
    [SnoozeOptions] NVARCHAR(255) NULL,
    [IsDismissed] BIT NOT NULL CONSTRAINT DF_TodoAlert_IsDismissed DEFAULT 0,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_TodoAlert_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_TodoAlert_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TodoAlert_TodoItemId' AND object_id = OBJECT_ID(N'app.TodoAlert'))
    CREATE INDEX IX_TodoAlert_TodoItemId ON app.TodoAlert ([TodoItemId], IsDeleted);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_TodoAlert_TodoItem' AND object_id = OBJECT_ID(N'app.TodoAlert'))
    CREATE UNIQUE INDEX UQ_TodoAlert_TodoItem ON app.TodoAlert ([TodoItemId]) WHERE IsDeleted = 0;
GO
-- ExistingSystemInterface (source: tblExistingSystemsInterfaces)
IF OBJECT_ID(N'app.ExistingSystemInterface', N'U') IS NULL
BEGIN
    CREATE TABLE app.ExistingSystemInterface (
    ExistingSystemInterfaceId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ExistingSystemInterface PRIMARY KEY,
    [ProjectId] INT NOT NULL CONSTRAINT FK_ExistingSystemInterface_Project_ProjectId REFERENCES app.Project(ProjectId),
    [HasInterface] BIT NOT NULL CONSTRAINT DF_ExistingSystemInterface_HasInterface DEFAULT 0,
    [Notes] NVARCHAR(MAX) NULL,
    [Location] NVARCHAR(MAX) NULL,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_ExistingSystemInterface_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_ExistingSystemInterface_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ExistingSystemInterface_ProjectId' AND object_id = OBJECT_ID(N'app.ExistingSystemInterface'))
    CREATE INDEX IX_ExistingSystemInterface_ProjectId ON app.ExistingSystemInterface (ProjectId, IsDeleted);
GO
