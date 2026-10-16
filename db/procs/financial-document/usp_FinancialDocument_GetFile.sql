-- usp_FinancialDocument_GetFile - one live attachment of a financial document, for the download
-- handler (GET /api/files/<id>?owner=financial-document, ADR-0026, ADR-0030). The attachment is
-- found through its app.FinancialDocumentFile link, so an attachment of another owner is NOT_FOUND
-- here; the document and its financial must be live and readable by the actor.
-- Access: Viewer on the financial's project.
-- Returns FileAttachmentId, FileName, ContentType, SizeBytes, Sha256, StoragePath, StorageLocation.
-- THROW 50001 NOT_FOUND | 50003 FORBIDDEN_ROW (the handler answers 404 to both).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_GetFile
    @FileAttachmentId INT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @FinancialDocumentId INT;
    SELECT @FinancialDocumentId = l.FinancialDocumentId
    FROM app.FinancialDocumentFile l
    JOIN app.FileAttachment f ON f.FileAttachmentId = l.FileAttachmentId
    WHERE l.FileAttachmentId = @FileAttachmentId AND f.IsDeleted = 0;
    IF @FinancialDocumentId IS NULL
        THROW 50001, N'NOT_FOUND:Attachment not found', 1;

    EXEC dbo.usp_FinancialDocument_AssertAccess
         @FinancialDocumentId = @FinancialDocumentId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer';

    SELECT FileAttachmentId,
           FileName,
           ContentType,
           SizeBytes,
           Sha256,
           StoragePath,
           StorageLocation
    FROM app.FileAttachment
    WHERE FileAttachmentId = @FileAttachmentId;
END;
GO
