-- usp_DailyActivity_ListFiles — a daily activity's live attachments, newest first (ADR-0026). A
-- child collection shown inside the record's sheet, so no paging (not an ADR-0016 list).
-- Access: Viewer on the activity's project (project-less activities allowed; ADR-0021).
-- Returns FileAttachmentId, FileName, ContentType, SizeBytes (NULL for a location), StorageLocation,
-- CreatedAtUtc, CreatedByName (who attached it) and RowVer.
-- THROW 50001 NOT_FOUND (activity absent or deleted) | 50003 FORBIDDEN_ROW.
-- Entities app.FileAttachment, app.DailyActivityFile. Module: file-storage (F1).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivity_ListFiles
    @DailyActivityId INT,
    @ActorUserId     INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_DailyActivity_AssertAccess
         @DailyActivityId = @DailyActivityId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer';

    SELECT f.FileAttachmentId,
           f.FileName,
           f.ContentType,
           f.SizeBytes,
           f.StorageLocation,
           f.CreatedAtUtc,
           u.DisplayName AS CreatedByName,
           CAST(f.RowVer AS BIGINT) AS RowVer
    FROM app.DailyActivityFile l
    JOIN app.FileAttachment f ON f.FileAttachmentId = l.FileAttachmentId
    LEFT JOIN auth.[User] u ON u.UserId = f.CreatedBy
    WHERE l.DailyActivityId = @DailyActivityId AND f.IsDeleted = 0
    ORDER BY f.CreatedAtUtc DESC, f.FileAttachmentId DESC;
END;
GO
