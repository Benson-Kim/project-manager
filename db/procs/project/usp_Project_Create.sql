-- usp_Project_Create — insert one app.Project row; audits in-transaction; returns the new row.
-- A non-Admin creator becomes the project's manager (title ProjectManager, access Manager,
--   ADR-0021) in the same transaction, so they can open what they just created.
-- Dropdown values (ADR-0022): ProjectStatus, ProjectPriority, ProjectPhase and RiskLevel must be live options of their lists (VALIDATION 50004),
--   and are stored as listed.
-- Entity app.Project (source: tblProjectFramework). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Project_Create
    @ProjectName NVARCHAR(255),
    @ProjectManager NVARCHAR(255) = NULL,
    @BusinessAnalyst NVARCHAR(255) = NULL,
    @ProjectDocs NVARCHAR(MAX) = NULL,
    @ProjectSponsor NVARCHAR(255) = NULL,
    @DateOfProject DATETIME2 = NULL,
    @ProblemStatement NVARCHAR(MAX) = NULL,
    @CurrentState NVARCHAR(MAX) = NULL,
    @FutureState NVARCHAR(MAX) = NULL,
    @UserImpact NVARCHAR(MAX) = NULL,
    @Mandate NVARCHAR(255) = NULL,
    @ProjectStatusCom NVARCHAR(MAX) = NULL,
    @ExistBusMod NVARCHAR(255) = NULL,
    @A1 BIT,
    @DA BIT,
    @DAS BIT,
    @PurchaseOrder BIT,
    @Requisition BIT,
    @DO BIT,
    @FinancingSource NVARCHAR(255) = NULL,
    @FinancingCost MONEY = NULL,
    @RecurrentCost MONEY = NULL,
    @PurchaseEquipment BIT,
    @EquipmentNotes NVARCHAR(MAX) = NULL,
    @StartDate DATETIME2 = NULL,
    @EndDate DATETIME2 = NULL,
    @SimilarProject BIT,
    @ProjectPriority NVARCHAR(50) = NULL,
    @EstimatedCompletionDate DATETIME2 = NULL,
    @ProjectStatus NVARCHAR(50) = NULL,
    @ProjectPhase NVARCHAR(50) = NULL,
    @RiskLevel NVARCHAR(50) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @ProjectName IS NULL OR LTRIM(RTRIM(@ProjectName)) = N''
        THROW 50004, N'VALIDATION:ProjectName is required', 1;

    -- The actor's role is read from auth.User, never trusted from the caller.
    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'project.status', @Label = @ProjectStatus OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'project.priority', @Label = @ProjectPriority OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'project.phase', @Label = @ProjectPhase OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'project.risk-level', @Label = @RiskLevel OUTPUT;

    BEGIN TRAN;

    INSERT INTO app.Project ([ProjectName], [ProjectManager], [BusinessAnalyst], [ProjectDocs], [ProjectSponsor], [DateOfProject], [ProblemStatement], [CurrentState], [FutureState], [UserImpact], [Mandate], [ProjectStatusCom], [ExistBusMod], [A1], [DA], [DAS], [PurchaseOrder], [Requisition], [DO], [FinancingSource], [FinancingCost], [RecurrentCost], [PurchaseEquipment], [EquipmentNotes], [StartDate], [EndDate], [SimilarProject], [ProjectPriority], [EstimatedCompletionDate], [ProjectStatus], [ProjectPhase], [RiskLevel], CreatedBy)
    VALUES (@ProjectName, @ProjectManager, @BusinessAnalyst, @ProjectDocs, @ProjectSponsor, @DateOfProject, @ProblemStatement, @CurrentState, @FutureState, @UserImpact, @Mandate, @ProjectStatusCom, @ExistBusMod, @A1, @DA, @DAS, @PurchaseOrder, @Requisition, @DO, @FinancingSource, @FinancingCost, @RecurrentCost, @PurchaseEquipment, @EquipmentNotes, @StartDate, @EndDate, @SimilarProject, @ProjectPriority, @EstimatedCompletionDate, @ProjectStatus, @ProjectPhase, @RiskLevel, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Project', CAST(@Id AS NVARCHAR(64)),
            (SELECT ProjectId, [ProjectName], [ProjectManager], [BusinessAnalyst], [ProjectDocs], [ProjectSponsor], [DateOfProject], [ProblemStatement], [CurrentState], [FutureState], [UserImpact], [Mandate], [ProjectStatusCom], [ExistBusMod], [A1], [DA], [DAS], [PurchaseOrder], [Requisition], [DO], [FinancingSource], [FinancingCost], [RecurrentCost], [PurchaseEquipment], [EquipmentNotes], [StartDate], [EndDate], [SimilarProject], [ProjectPriority], [EstimatedCompletionDate], [ProjectStatus], [ProjectPhase], [RiskLevel]
             FROM app.Project WHERE ProjectId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    IF @ActorRole <> N'Admin'
    BEGIN
        INSERT INTO app.ProjectAssignee ([ProjectId], [Role], [PersonName], [UserId], [AccessLevel], CreatedBy)
        SELECT @Id, N'ProjectManager', u.DisplayName, u.UserId, N'Manager', @ActorUserId
        FROM auth.[User] u WHERE u.UserId = @ActorUserId;
        DECLARE @AssigneeId INT = SCOPE_IDENTITY();

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
        VALUES (@ActorUserId, N'Create', N'app.ProjectAssignee', CAST(@AssigneeId AS NVARCHAR(64)),
                (SELECT ProjectAssigneeId, [ProjectId], [Role], [PersonName], [UserId], [AccessLevel]
                 FROM app.ProjectAssignee WHERE ProjectAssigneeId = @AssigneeId
                 FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
    END;

    COMMIT;

    SELECT ProjectId,
           [ProjectName],
           [ProjectManager],
           [BusinessAnalyst],
           [ProjectDocs],
           [ProjectSponsor],
           [DateOfProject],
           [ProblemStatement],
           [CurrentState],
           [FutureState],
           [UserImpact],
           [Mandate],
           [ProjectStatusCom],
           [ExistBusMod],
           [A1],
           [DA],
           [DAS],
           [PurchaseOrder],
           [Requisition],
           [DO],
           [FinancingSource],
           [FinancingCost],
           [RecurrentCost],
           [PurchaseEquipment],
           [EquipmentNotes],
           [StartDate],
           [EndDate],
           [SimilarProject],
           [ProjectPriority],
           [EstimatedCompletionDate],
           [ProjectStatus],
           [ProjectPhase],
           [RiskLevel],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Project
    WHERE ProjectId = @Id;
END;
GO
