-- usp_Note_AddFile — attach an uploaded file OR a location reference to a note
-- (ADR-0026). Inserts app.FileAttachment + its app.NoteFile link and audits in-transaction;
-- returns the new attachment as usp_Note_ListFiles shapes it.
--   * Access: Contributor + 'notes:update' on the note's project (project-less
--     notes allowed; ADR-0021/0024): an attachment edits the record, as in Access.
--   * Exactly one kind (VALIDATION 50004): a file (@ContentType, @SizeBytes, @Sha256, @StoragePath;
--     the bytes are already stored under UPLOADS_DIR by the upload handler) or @StorageLocation.
--   * Quota (ADR-0026 §6): a file must fit in @QuotaBytes for the note's project (project-less
--     rows share one bucket), counted over live rows. The sum runs under an exclusive app lock on
--     the bucket, so parallel uploads cannot both slip under it: THROW 50006 QUOTA_EXCEEDED.
--   * ProjectId is copied from the note. A note does not move between projects, so the only
--     concurrent change to guard is a delete: the transaction opens first, the live note is read
--     under UPDLOCK, HOLDLOCK and access is checked once under that lock, so a concurrent delete
--     waits for COMMIT and the attachment never outlives its note. Lock order (note row, then quota
--     lock, then attachment rows) matches usp_Note_Delete (note row first).
-- THROW 50001 NOT_FOUND | 50003 FORBIDDEN_ROW | 50004 VALIDATION | 50006 QUOTA_EXCEEDED.
-- Entities app.FileAttachment, app.NoteFile. Module: file-storage (F1).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Note_AddFile
    @NoteId INT,
    @FileName        NVARCHAR(255),
    @ContentType     VARCHAR(100)  = NULL,
    @SizeBytes       BIGINT        = NULL,
    @Sha256          CHAR(64)      = NULL,
    @StoragePath     VARCHAR(80)   = NULL,
    @StorageLocation NVARCHAR(500) = NULL,
    @QuotaBytes      BIGINT        = NULL,
    @ActorUserId     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    DECLARE @ProjectId INT;
    SELECT @ProjectId = ProjectId
    FROM app.Note WITH (UPDLOCK, HOLDLOCK)
    WHERE NoteId = @NoteId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Note not found', 1;

    EXEC dbo.usp_Note_AssertAccess
         @NoteId = @NoteId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'notes:update';

    SET @FileName = NULLIF(LTRIM(RTRIM(@FileName)), N'');
    SET @StorageLocation = NULLIF(LTRIM(RTRIM(@StorageLocation)), N'');
    IF @FileName IS NULL
        THROW 50004, N'VALIDATION:An attachment needs a name', 1;
    DECLARE @IsFile BIT = CASE WHEN @Sha256 IS NOT NULL OR @StoragePath IS NOT NULL
                                    OR @SizeBytes IS NOT NULL OR @ContentType IS NOT NULL
                               THEN 1 ELSE 0 END;
    IF (@IsFile = 1 AND (@StorageLocation IS NOT NULL OR @Sha256 IS NULL OR @StoragePath IS NULL
                         OR @SizeBytes IS NULL OR @ContentType IS NULL))
       OR (@IsFile = 0 AND @StorageLocation IS NULL)
        THROW 50004, N'VALIDATION:An attachment is either a file or a location', 1;

    IF @IsFile = 1
    BEGIN
        DECLARE @Bucket NVARCHAR(64) = N'file-quota:' + ISNULL(CAST(@ProjectId AS NVARCHAR(12)), N'none');
        DECLARE @Lock INT;
        EXEC @Lock = sp_getapplock @Resource = @Bucket, @LockMode = 'Exclusive',
                                   @LockOwner = 'Transaction', @LockTimeout = 15000;
        IF @Lock < 0
            THROW 50999, N'INTERNAL:The attachment quota is busy', 1;

        DECLARE @Used BIGINT =
            ISNULL((SELECT SUM(SizeBytes) FROM app.FileAttachment
                    WHERE IsDeleted = 0
                      AND (ProjectId = @ProjectId OR (@ProjectId IS NULL AND ProjectId IS NULL))), 0);
        IF @QuotaBytes IS NOT NULL AND @Used + @SizeBytes > @QuotaBytes
            THROW 50006, N'QUOTA_EXCEEDED:The project has no room for this file', 1;
    END;

    INSERT INTO app.FileAttachment
        (ProjectId, FileName, ContentType, SizeBytes, Sha256, StoragePath, StorageLocation, CreatedBy)
    VALUES
        (@ProjectId, @FileName, @ContentType, @SizeBytes, @Sha256, @StoragePath, @StorageLocation, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO app.NoteFile (NoteId, FileAttachmentId)
    VALUES (@NoteId, @Id);

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.FileAttachment', CAST(@Id AS NVARCHAR(64)),
            (SELECT f.FileAttachmentId, l.NoteId, f.ProjectId, f.FileName, f.ContentType,
                    f.SizeBytes, f.Sha256, f.StorageLocation
             FROM app.FileAttachment f
             JOIN app.NoteFile l ON l.FileAttachmentId = f.FileAttachmentId
             WHERE f.FileAttachmentId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

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
    WHERE f.FileAttachmentId = @Id;
END;
GO
