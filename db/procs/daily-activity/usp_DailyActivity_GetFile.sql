-- usp_DailyActivity_GetFile — one live attachment of a daily activity, for the download handler
-- (GET /api/files/<id>?owner=daily-activity, ADR-0026). The attachment is found through its
-- app.DailyActivityFile link; the activity must be live and readable by the actor.
-- Access: Viewer on the activity's project (project-less activities allowed; ADR-0021).
-- Returns FileAttachmentId, FileName, ContentType, SizeBytes, Sha256, StoragePath, StorageLocation
-- (a location row has no bytes: the handler answers 404 for it).
-- THROW 50001 NOT_FOUND (attachment or activity absent/deleted) | 50003 FORBIDDEN_ROW. The handler
-- answers 404 to both, so a download never reveals that a record exists.
-- Entities app.FileAttachment, app.DailyActivityFile. Module: file-storage (F1).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivity_GetFile
    @FileAttachmentId INT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @DailyActivityId INT;
    SELECT @DailyActivityId = l.DailyActivityId
    FROM app.DailyActivityFile l
    JOIN app.FileAttachment f ON f.FileAttachmentId = l.FileAttachmentId
    WHERE l.FileAttachmentId = @FileAttachmentId AND f.IsDeleted = 0;
    IF @DailyActivityId IS NULL
        THROW 50001, N'NOT_FOUND:Attachment not found', 1;

    EXEC dbo.usp_DailyActivity_AssertAccess
         @DailyActivityId = @DailyActivityId, @ActorUserId = @ActorUserId,
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
