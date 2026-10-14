-- usp_DailyActivity_RenameFile — rename one attachment of a daily activity (ADR-0026) with rowversion
-- concurrency (50002 CONFLICT) and an in-transaction audit; returns the row as ListFiles shapes it.
-- An uploaded file keeps its extension: a new name without it gets it back, so the download still
-- opens in the right program. A location row takes the name as typed.
-- Access: Contributor + 'daily-activities:update' (an attachment edits the record; ADR-0021/0024).
-- THROW 50001 NOT_FOUND | 50002 CONFLICT | 50003 FORBIDDEN_ROW | 50004 VALIDATION (blank name).
-- Entities app.FileAttachment, app.DailyActivityFile. Module: file-storage (F1).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivity_RenameFile
    @FileAttachmentId INT,
    @FileName         NVARCHAR(255),
    @RowVer           BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @DailyActivityId INT, @CurrentVer BIGINT, @OldName NVARCHAR(255), @IsFile BIT;
    SELECT @DailyActivityId = l.DailyActivityId, @CurrentVer = CAST(f.RowVer AS BIGINT),
           @OldName = f.FileName, @IsFile = CASE WHEN f.Sha256 IS NULL THEN 0 ELSE 1 END
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

    SET @FileName = NULLIF(LTRIM(RTRIM(@FileName)), N'');
    IF @FileName IS NULL
        THROW 50004, N'VALIDATION:An attachment needs a name', 1;

    -- The old extension, e.g. N'.pdf' (NULL when the old name has none).
    DECLARE @Dot INT = CHARINDEX(N'.', REVERSE(@OldName));
    DECLARE @Ext NVARCHAR(255) = CASE WHEN @IsFile = 1 AND @Dot > 1 THEN RIGHT(@OldName, @Dot) END;
    IF @Ext IS NOT NULL AND RIGHT(@FileName, LEN(@Ext)) <> @Ext
        SET @FileName = LEFT(@FileName, 255 - LEN(@Ext)) + @Ext;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT FileAttachmentId, FileName FROM app.FileAttachment
         WHERE FileAttachmentId = @FileAttachmentId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.FileAttachment SET
        FileName     = @FileName,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE FileAttachmentId = @FileAttachmentId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Attachment was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.FileAttachment', CAST(@FileAttachmentId AS NVARCHAR(64)), @Before,
            (SELECT FileAttachmentId, FileName FROM app.FileAttachment
             WHERE FileAttachmentId = @FileAttachmentId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT f.FileAttachmentId,
           f.FileName,
           f.ContentType,
           f.SizeBytes,
           f.StorageLocation,
           f.CreatedAtUtc,
           u.DisplayName AS CreatedByName,
           CAST(f.RowVer AS BIGINT) AS RowVer
    FROM app.FileAttachment f
    LEFT JOIN auth.[User] u ON u.UserId = f.CreatedBy
    WHERE f.FileAttachmentId = @FileAttachmentId;
END;
GO
