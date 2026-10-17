-- usp_FinancialLine_Delete - soft-delete a budget line (ADR-0029). A line with live transactions
-- is kept (VALIDATION 50004): remove or move its invoices first, so spending never loses its line
-- (the workbook's #REF! monitoring blocks). RowVer concurrency (CONFLICT 50002, NOT_FOUND 50001).
-- Access: Manager with 'financials:delete'. Audited in-transaction.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialLine_Delete
    @FinancialLineId INT,
    @RowVer          BIGINT,
    @ActorUserId     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @FinancialId INT;
    SELECT @FinancialId = FinancialId FROM app.FinancialLine
    WHERE FinancialLineId = @FinancialLineId AND IsDeleted = 0;
    IF @FinancialId IS NULL
        THROW 50001, N'NOT_FOUND:Budget line not found', 1;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:delete';

    BEGIN TRAN;

    DECLARE @Lock INT;
    SELECT @Lock = FinancialId FROM app.Financial WITH (UPDLOCK, HOLDLOCK) WHERE FinancialId = @FinancialId;

    IF EXISTS (SELECT 1 FROM app.FinancialTransaction WHERE FinancialLineId = @FinancialLineId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:This line has transactions; remove or move them first', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT * FROM dbo.ufn_FinancialLine_Row(@FinancialLineId) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.FinancialLine SET IsDeleted = 1, DeletedAtUtc = SYSUTCDATETIME(), DeletedBy = @ActorUserId
    WHERE FinancialLineId = @FinancialLineId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.FinancialLine WHERE FinancialLineId = @FinancialLineId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Budget line not found', 1;
        THROW 50002, N'CONFLICT:The budget line was changed by someone else', 1;
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.FinancialLine', CAST(@FinancialLineId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
