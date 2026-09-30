-- usp_Project_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.Project (source: tblProjectFramework). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Project_Update
    @ProjectId INT,
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
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.Project WHERE ProjectId = @ProjectId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Project not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Project was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT ProjectId, [ProjectName], [ProjectManager], [BusinessAnalyst], [ProjectDocs], [ProjectSponsor], [DateOfProject], [ProblemStatement], [CurrentState], [FutureState], [UserImpact], [Mandate], [ProjectStatusCom], [ExistBusMod], [A1], [DA], [DAS], [PurchaseOrder], [Requisition], [DO], [FinancingSource], [FinancingCost], [RecurrentCost], [PurchaseEquipment], [EquipmentNotes], [StartDate], [EndDate], [SimilarProject], [ProjectPriority], [EstimatedCompletionDate], [ProjectStatus], [ProjectPhase], [RiskLevel]
         FROM app.Project WHERE ProjectId = @ProjectId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Project SET
        [ProjectName] = @ProjectName,
        [ProjectManager] = @ProjectManager,
        [BusinessAnalyst] = @BusinessAnalyst,
        [ProjectDocs] = @ProjectDocs,
        [ProjectSponsor] = @ProjectSponsor,
        [DateOfProject] = @DateOfProject,
        [ProblemStatement] = @ProblemStatement,
        [CurrentState] = @CurrentState,
        [FutureState] = @FutureState,
        [UserImpact] = @UserImpact,
        [Mandate] = @Mandate,
        [ProjectStatusCom] = @ProjectStatusCom,
        [ExistBusMod] = @ExistBusMod,
        [A1] = @A1,
        [DA] = @DA,
        [DAS] = @DAS,
        [PurchaseOrder] = @PurchaseOrder,
        [Requisition] = @Requisition,
        [DO] = @DO,
        [FinancingSource] = @FinancingSource,
        [FinancingCost] = @FinancingCost,
        [RecurrentCost] = @RecurrentCost,
        [PurchaseEquipment] = @PurchaseEquipment,
        [EquipmentNotes] = @EquipmentNotes,
        [StartDate] = @StartDate,
        [EndDate] = @EndDate,
        [SimilarProject] = @SimilarProject,
        [ProjectPriority] = @ProjectPriority,
        [EstimatedCompletionDate] = @EstimatedCompletionDate,
        [ProjectStatus] = @ProjectStatus,
        [ProjectPhase] = @ProjectPhase,
        [RiskLevel] = @RiskLevel,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE ProjectId = @ProjectId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Project WHERE ProjectId = @ProjectId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Project not found', 1;
        THROW 50002, N'CONFLICT:Project was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Project', CAST(@ProjectId AS NVARCHAR(64)), @Before,
            (SELECT ProjectId, [ProjectName], [ProjectManager], [BusinessAnalyst], [ProjectDocs], [ProjectSponsor], [DateOfProject], [ProblemStatement], [CurrentState], [FutureState], [UserImpact], [Mandate], [ProjectStatusCom], [ExistBusMod], [A1], [DA], [DAS], [PurchaseOrder], [Requisition], [DO], [FinancingSource], [FinancingCost], [RecurrentCost], [PurchaseEquipment], [EquipmentNotes], [StartDate], [EndDate], [SimilarProject], [ProjectPriority], [EstimatedCompletionDate], [ProjectStatus], [ProjectPhase], [RiskLevel]
             FROM app.Project WHERE ProjectId = @ProjectId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

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
    WHERE ProjectId = @ProjectId;
END;
GO
