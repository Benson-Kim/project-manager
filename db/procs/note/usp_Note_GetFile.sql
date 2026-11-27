-- usp_Note_GetFile — one live attachment of a note, for the download handler
-- (GET /api/files/<id>?owner=note, ADR-0026). The attachment is found through its
-- app.NoteFile link; the note must be live and readable by the actor.
-- Access: Viewer on the note's project (project-less notes allowed; ADR-0021).
-- Returns FileAttachmentId, FileName, ContentType, SizeBytes, Sha256, StoragePath, StorageLocation
-- (a location row has no bytes: the handler answers 404 for it).
-- THROW 50001 NOT_FOUND (attachment or note absent/deleted) | 50003 FORBIDDEN_ROW. The handler
-- answers 404 to both, so a download never reveals that a record exists.
-- Entities app.FileAttachment, app.NoteFile. Module: file-storage (F1).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Note_GetFile
    @FileAttachmentId INT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @NoteId INT;
    SELECT @NoteId = l.NoteId
    FROM app.NoteFile l
    JOIN app.FileAttachment f ON f.FileAttachmentId = l.FileAttachmentId
    WHERE l.FileAttachmentId = @FileAttachmentId AND f.IsDeleted = 0;
    IF @NoteId IS NULL
        THROW 50001, N'NOT_FOUND:Attachment not found', 1;

    EXEC dbo.usp_Note_AssertAccess
         @NoteId = @NoteId, @ActorUserId = @ActorUserId,
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
