-- usp_FinancialDocument_ListFiles - a financial document's live attachments, newest first
-- (ADR-0026, ADR-0030). A child collection, so no paging (not an ADR-0016 list).
-- Access: Viewer on the financial's project (usp_FinancialDocument_AssertAccess).
-- Returns FileAttachmentId, FileName, ContentType, SizeBytes (NULL for a location), StorageLocation,
-- CreatedAtUtc, CreatedByName and RowVer.
-- THROW 50001 NOT_FOUND (document or financial absent or deleted) | 50003 FORBIDDEN_ROW.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_ListFiles
    @FinancialDocumentId INT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_FinancialDocument_AssertAccess
         @FinancialDocumentId = @FinancialDocumentId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer';

    SELECT f.FileAttachmentId,
           f.FileName,
           f.ContentType,
           f.SizeBytes,
           f.StorageLocation,
           f.CreatedAtUtc,
           u.DisplayName AS CreatedByName,
           CAST(f.RowVer AS BIGINT) AS RowVer
    FROM app.FinancialDocumentFile l
    JOIN app.FileAttachment f ON f.FileAttachmentId = l.FileAttachmentId
    LEFT JOIN auth.[User] u ON u.UserId = f.CreatedBy
    WHERE l.FinancialDocumentId = @FinancialDocumentId AND f.IsDeleted = 0
    ORDER BY f.CreatedAtUtc DESC, f.FileAttachmentId DESC;
END;
GO
