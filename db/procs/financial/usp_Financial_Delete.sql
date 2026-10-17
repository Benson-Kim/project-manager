-- usp_Financial_Delete - soft-delete one financial and everything it owns (ADR-0029): budget
-- lines, their transactions, tax profiles, document checklist rows and their attachments
-- (ADR-0030; the bytes stay until the orphan sweep), in one transaction.
-- Typed amounts stay with their (deleted) lines. RowVer concurrency (CONFLICT 50002,
-- NOT_FOUND 50001). Access: Manager with 'financials:delete'. Audited in-transaction.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Financial_Delete
    @FinancialId INT,
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:delete';

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT * FROM dbo.ufn_Financial_Row(@FinancialId) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    DECLARE @Now DATETIME2 = SYSUTCDATETIME();

    UPDATE app.Financial SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    WHERE FinancialId = @FinancialId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Financial WHERE FinancialId = @FinancialId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Financial not found', 1;
        THROW 50002, N'CONFLICT:The financial was changed by someone else', 1;
    END;

    UPDATE t SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    FROM app.FinancialTransaction AS t
    JOIN app.FinancialLine AS l ON l.FinancialLineId = t.FinancialLineId
    WHERE l.FinancialId = @FinancialId AND t.IsDeleted = 0;

    UPDATE app.FinancialLine SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;

    UPDATE app.FinancialTaxProfile SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;

    UPDATE f SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    FROM app.FileAttachment AS f
    JOIN app.FinancialDocumentFile AS l ON l.FileAttachmentId = f.FileAttachmentId
    JOIN app.FinancialDocument AS d ON d.FinancialDocumentId = l.FinancialDocumentId
    WHERE d.FinancialId = @FinancialId AND d.IsDeleted = 0 AND f.IsDeleted = 0;

    UPDATE app.FinancialDocument SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.Financial', CAST(@FinancialId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
