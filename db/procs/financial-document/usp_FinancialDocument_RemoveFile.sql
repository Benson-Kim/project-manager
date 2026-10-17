-- usp_FinancialDocument_RemoveFile - soft-delete one attachment of a financial document (ADR-0026
-- section 2, ADR-0030) with rowversion concurrency (50002 CONFLICT) and an in-transaction audit. The
-- stored bytes stay until the orphan sweep finds no live or recently deleted row using them.
-- Access: Manager + 'financials:update': removing an attachment edits the checklist row, so it is
-- not the section's delete permission (as for every attachment owner).
-- THROW 50001 NOT_FOUND | 50002 CONFLICT | 50003 FORBIDDEN_ROW.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_RemoveFile
    @FileAttachmentId INT,
    @RowVer           BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @FinancialDocumentId INT, @CurrentVer BIGINT;
    SELECT @FinancialDocumentId = l.FinancialDocumentId, @CurrentVer = CAST(f.RowVer AS BIGINT)
    FROM app.FinancialDocumentFile l
    JOIN app.FileAttachment f ON f.FileAttachmentId = l.FileAttachmentId
    WHERE l.FileAttachmentId = @FileAttachmentId AND f.IsDeleted = 0;
    IF @FinancialDocumentId IS NULL
        THROW 50001, N'NOT_FOUND:Attachment not found', 1;

    EXEC dbo.usp_FinancialDocument_AssertAccess
         @FinancialDocumentId = @FinancialDocumentId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:update';

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Attachment was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT f.FileAttachmentId, l.FinancialDocumentId, f.ProjectId, f.FileName, f.ContentType,
                f.SizeBytes, f.Sha256, f.StorageLocation
         FROM app.FileAttachment f
         JOIN app.FinancialDocumentFile l ON l.FileAttachmentId = f.FileAttachmentId
         WHERE f.FileAttachmentId = @FileAttachmentId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.FileAttachment SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE FileAttachmentId = @FileAttachmentId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Attachment was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.FileAttachment', CAST(@FileAttachmentId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
