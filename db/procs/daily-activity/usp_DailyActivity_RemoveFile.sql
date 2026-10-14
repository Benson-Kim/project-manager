-- usp_DailyActivity_RemoveFile — soft-delete one attachment of a daily activity (ADR-0026 §2) with
-- rowversion concurrency (50002 CONFLICT) and an in-transaction audit. The stored bytes stay until
-- the orphan sweep (src/lib/files/sweep.ts) finds no live or recently deleted row using them.
-- Access: Contributor + 'daily-activities:update' — removing an attachment edits the record (user
-- decision 2026-10-10), so it is not the section's delete permission.
-- THROW 50001 NOT_FOUND | 50002 CONFLICT | 50003 FORBIDDEN_ROW.
-- Entities app.FileAttachment, app.DailyActivityFile. Module: file-storage (F1).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivity_RemoveFile
    @FileAttachmentId INT,
    @RowVer           BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @DailyActivityId INT, @CurrentVer BIGINT;
    SELECT @DailyActivityId = l.DailyActivityId, @CurrentVer = CAST(f.RowVer AS BIGINT)
    FROM app.DailyActivityFile l
    JOIN app.FileAttachment f ON f.FileAttachmentId = l.FileAttachmentId
    WHERE l.FileAttachmentId = @FileAttachmentId AND f.IsDeleted = 0;
    IF @DailyActivityId IS NULL
        THROW 50001, N'NOT_FOUND:Attachment not found', 1;

    EXEC dbo.usp_DailyActivity_AssertAccess
         @DailyActivityId = @DailyActivityId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'daily-activities:update';

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Attachment was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT f.FileAttachmentId, l.DailyActivityId, f.ProjectId, f.FileName, f.ContentType,
                f.SizeBytes, f.Sha256, f.StorageLocation
         FROM app.FileAttachment f
         JOIN app.DailyActivityFile l ON l.FileAttachmentId = f.FileAttachmentId
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
