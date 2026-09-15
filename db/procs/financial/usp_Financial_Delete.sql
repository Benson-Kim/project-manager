-- usp_Financial_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.Financial (source: tblFinancials). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Financial_Delete
    @FinancialId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.Financial WHERE FinancialId = @FinancialId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Financial not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Financial was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT FinancialId, [ProjectId], [ProjectNumber], [Acquisition], [GlGrandLivre], [BudgetEnvelope], [Budget], [SpendBy], [RecurrentFees], [ContractTimeframe]
         FROM app.Financial WHERE FinancialId = @FinancialId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Financial SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.Financial', CAST(@FinancialId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
