-- usp_Note_ListFiles — a note's live attachments, newest first (ADR-0026). A
-- child collection shown inside the record's sheet, so no paging (not an ADR-0016 list).
-- Access: Viewer on the note's project (project-less notes allowed; ADR-0021).
-- Returns FileAttachmentId, FileName, ContentType, SizeBytes (NULL for a location), StorageLocation,
-- CreatedAtUtc, CreatedByName (who attached it) and RowVer.
-- THROW 50001 NOT_FOUND (note absent or deleted) | 50003 FORBIDDEN_ROW.
-- Entities app.FileAttachment, app.NoteFile. Module: file-storage (F1).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Note_ListFiles
    @NoteId INT,
    @ActorUserId     INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Note_AssertAccess
         @NoteId = @NoteId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer';

    SELECT f.FileAttachmentId,
           f.FileName,
           f.ContentType,
           f.SizeBytes,
           f.StorageLocation,
           f.CreatedAtUtc,
           u.DisplayName AS CreatedByName,
           CAST(f.RowVer AS BIGINT) AS RowVer
    FROM app.NoteFile l
    JOIN app.FileAttachment f ON f.FileAttachmentId = l.FileAttachmentId
    LEFT JOIN auth.[User] u ON u.UserId = f.CreatedBy
    WHERE l.NoteId = @NoteId AND f.IsDeleted = 0
    ORDER BY f.CreatedAtUtc DESC, f.FileAttachmentId DESC;
END;
GO
