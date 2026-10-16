-- usp_FinancialTransaction_Delete - soft-delete an invoice (ADR-0029). RowVer concurrency
-- (CONFLICT 50002, NOT_FOUND 50001). Access: Manager, or a per-person grant, on section
-- 'financial-tax-invoices' (delete) of the row's project. Audited in-transaction.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialTransaction_Delete
    @FinancialTransactionId INT,
    @RowVer                 BIGINT,
    @ActorUserId            INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @FinancialId INT;
    SELECT @FinancialId = l.FinancialId
    FROM app.FinancialTransaction AS t
    JOIN app.FinancialLine AS l ON l.FinancialLineId = t.FinancialLineId
    WHERE t.FinancialTransactionId = @FinancialTransactionId AND t.IsDeleted = 0 AND l.IsDeleted = 0;
    IF @FinancialId IS NULL
        THROW 50001, N'NOT_FOUND:Transaction not found', 1;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financial-tax-invoices:delete';

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT * FROM dbo.ufn_FinancialTransaction_Row(@FinancialTransactionId) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.FinancialTransaction SET IsDeleted = 1, DeletedAtUtc = SYSUTCDATETIME(), DeletedBy = @ActorUserId
    WHERE FinancialTransactionId = @FinancialTransactionId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.FinancialTransaction WHERE FinancialTransactionId = @FinancialTransactionId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Transaction not found', 1;
        THROW 50002, N'CONFLICT:The transaction was changed by someone else', 1;
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.FinancialTransaction', CAST(@FinancialTransactionId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
