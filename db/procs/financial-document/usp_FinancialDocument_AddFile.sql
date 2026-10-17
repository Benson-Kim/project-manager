-- usp_FinancialDocument_AddFile - attach an uploaded file OR a location reference to a financial's
-- document (ADR-0026, ADR-0030): a signed contract, a requisition, the DA itself. Inserts
-- app.FileAttachment + its app.FinancialDocumentFile link and audits in-transaction; returns the new
-- attachment as usp_FinancialDocument_ListFiles shapes it.
--   * Access: Manager + 'financials:update' on the financial's project (ADR-0021/0024): an
--     attachment edits the checklist row.
--   * Exactly one kind (VALIDATION 50004): a file (@ContentType, @SizeBytes, @Sha256, @StoragePath;
--     the bytes are already stored by the upload handler) or @StorageLocation.
--   * Quota (ADR-0026 section 6): a file must fit in @QuotaBytes for the project, counted over live
--     rows under an exclusive app lock on the bucket: THROW 50006 QUOTA_EXCEEDED.
--   * The body is validated first (nothing locked). Then the transaction opens: the live financial
--     row is read under UPDLOCK, HOLDLOCK (the lock
--     every financial write takes first), then the live document, then access is checked once,
--     under that lock. A concurrent delete of the document or the financial waits for COMMIT, so
--     the attachment never outlives its owner. Lock order: financial row, quota lock, attachment.
-- THROW 50001 NOT_FOUND | 50003 FORBIDDEN_ROW | 50004 VALIDATION | 50006 QUOTA_EXCEEDED.
-- Entities app.FileAttachment, app.FinancialDocumentFile.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_AddFile
    @FinancialDocumentId INT,
    @FileName            NVARCHAR(255),
    @ContentType         VARCHAR(100)  = NULL,
    @SizeBytes           BIGINT        = NULL,
    @Sha256              CHAR(64)      = NULL,
    @StoragePath         VARCHAR(80)   = NULL,
    @StorageLocation     NVARCHAR(500) = NULL,
    @QuotaBytes          BIGINT        = NULL,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

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

    BEGIN TRAN;

    DECLARE @FinancialId INT =
        (SELECT FinancialId FROM app.FinancialDocument
         WHERE FinancialDocumentId = @FinancialDocumentId AND IsDeleted = 0);
    DECLARE @ProjectId INT;
    SELECT @ProjectId = ProjectId
    FROM app.Financial WITH (UPDLOCK, HOLDLOCK)
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;
    IF @ProjectId IS NULL
       OR NOT EXISTS (SELECT 1 FROM app.FinancialDocument
                      WHERE FinancialDocumentId = @FinancialDocumentId AND FinancialId = @FinancialId
                        AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Document not found', 1;

    EXEC dbo.usp_FinancialDocument_AssertAccess
         @FinancialDocumentId = @FinancialDocumentId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:update';

    IF @IsFile = 1
    BEGIN
        DECLARE @Bucket NVARCHAR(64) = N'file-quota:' + CAST(@ProjectId AS NVARCHAR(12));
        DECLARE @Lock INT;
        EXEC @Lock = sp_getapplock @Resource = @Bucket, @LockMode = 'Exclusive',
                                   @LockOwner = 'Transaction', @LockTimeout = 15000;
        IF @Lock < 0
            THROW 50999, N'INTERNAL:The attachment quota is busy', 1;

        DECLARE @Used BIGINT =
            ISNULL((SELECT SUM(SizeBytes) FROM app.FileAttachment
                    WHERE IsDeleted = 0 AND ProjectId = @ProjectId), 0);
        IF @QuotaBytes IS NOT NULL AND @Used + @SizeBytes > @QuotaBytes
            THROW 50006, N'QUOTA_EXCEEDED:The project has no room for this file', 1;
    END;

    INSERT INTO app.FileAttachment
        (ProjectId, FileName, ContentType, SizeBytes, Sha256, StoragePath, StorageLocation, CreatedBy)
    VALUES
        (@ProjectId, @FileName, @ContentType, @SizeBytes, @Sha256, @StoragePath, @StorageLocation, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO app.FinancialDocumentFile (FinancialDocumentId, FileAttachmentId)
    VALUES (@FinancialDocumentId, @Id);

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.FileAttachment', CAST(@Id AS NVARCHAR(64)),
            (SELECT f.FileAttachmentId, l.FinancialDocumentId, f.ProjectId, f.FileName, f.ContentType,
                    f.SizeBytes, f.Sha256, f.StorageLocation
             FROM app.FileAttachment f
             JOIN app.FinancialDocumentFile l ON l.FileAttachmentId = f.FileAttachmentId
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
