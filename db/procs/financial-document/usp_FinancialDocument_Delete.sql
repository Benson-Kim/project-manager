-- usp_FinancialDocument_Delete - remove a document from a financial's checklist (ADR-0030) with
-- its attachments (soft delete, one transaction; the bytes stay until the orphan sweep, ADR-0026
-- section 5). RowVer concurrency (CONFLICT 50002, NOT_FOUND 50001).
-- Access: Manager with 'financials:delete' on the financial's project. Audited in-transaction.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_Delete
    @FinancialDocumentId INT,
    @RowVer              BIGINT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @FinancialId INT;
    EXEC dbo.usp_FinancialDocument_AssertAccess
         @FinancialDocumentId = @FinancialDocumentId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:delete', @FinancialId = @FinancialId OUTPUT;

    BEGIN TRAN;

    DECLARE @Lock INT;
    SELECT @Lock = FinancialId FROM app.Financial WITH (UPDLOCK, HOLDLOCK)
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;
    IF @Lock IS NULL
        THROW 50001, N'NOT_FOUND:Financial not found', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT * FROM dbo.ufn_FinancialDocument_Row(@FinancialDocumentId) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    DECLARE @Now DATETIME2 = SYSUTCDATETIME();

    UPDATE app.FinancialDocument SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    WHERE FinancialDocumentId = @FinancialDocumentId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.FinancialDocument WHERE FinancialDocumentId = @FinancialDocumentId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Document not found', 1;
        THROW 50002, N'CONFLICT:The document was changed by someone else', 1;
    END;

    UPDATE f SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    FROM app.FileAttachment AS f
    JOIN app.FinancialDocumentFile AS l ON l.FileAttachmentId = f.FileAttachmentId
    WHERE l.FinancialDocumentId = @FinancialDocumentId AND f.IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.FinancialDocument', CAST(@FinancialDocumentId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
