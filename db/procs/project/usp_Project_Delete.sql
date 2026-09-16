-- usp_Project_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.Project (source: tblProjectFramework). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Project_Delete
    @ProjectId INT,
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
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE ProjectId = @ProjectId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.Project', CAST(@ProjectId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
