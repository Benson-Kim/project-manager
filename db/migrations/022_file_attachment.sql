-- 022_file_attachment.sql — file attachments any module can reuse (ADR-0026, checklist rows 43–44).
--   1. app.FileAttachment: one attachment, with no owner columns. Either an uploaded file (sniffed
--      ContentType, SizeBytes, Sha256 and its sharded StoragePath under UPLOADS_DIR; the bytes never
--      enter SQL Server) or a location reference with no bytes (StorageLocation: a SharePoint URL, a
--      network path…). CK_FileAttachment_FileOrLocation allows exactly one. FileName is the display
--      and download name. ProjectId is copied from the owner for the per-project quota (NULL = the
--      project-less bucket). Identical bytes share one stored file; each upload has its own row.
--   2. app.DailyActivityFile: the daily-activity link (owner-scoped, ADR-0026 §1). An attachment
--      belongs to exactly one owner (UQ on FileAttachmentId). Soft delete lives on FileAttachment.
-- No seeds: the Access attachment bytes (tblDailyActivityList.Attachment) were never extracted.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.FileAttachment', N'U') IS NULL
BEGIN
    CREATE TABLE app.FileAttachment (
        FileAttachmentId INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_FileAttachment PRIMARY KEY,
        ProjectId        INT           NULL
            CONSTRAINT FK_FileAttachment_Project REFERENCES app.Project (ProjectId),
        FileName         NVARCHAR(255) NOT NULL,
        ContentType      VARCHAR(100)  NULL,
        SizeBytes        BIGINT        NULL,
        Sha256           CHAR(64)      NULL,
        StoragePath      VARCHAR(80)   NULL,
        StorageLocation  NVARCHAR(500) NULL,
        IsDeleted        BIT           NOT NULL CONSTRAINT DF_FileAttachment_IsDeleted DEFAULT 0,
        DeletedAtUtc     DATETIME2     NULL,
        DeletedBy        INT           NULL,
        CreatedAtUtc     DATETIME2     NOT NULL CONSTRAINT DF_FileAttachment_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy        INT           NOT NULL,
        UpdatedAtUtc     DATETIME2     NULL,
        UpdatedBy        INT           NULL,
        RowVer           ROWVERSION,
        CONSTRAINT CK_FileAttachment_FileOrLocation CHECK (
            (StorageLocation IS NULL AND ContentType IS NOT NULL AND SizeBytes IS NOT NULL
                AND Sha256 IS NOT NULL AND StoragePath IS NOT NULL)
            OR (StorageLocation IS NOT NULL AND ContentType IS NULL AND SizeBytes IS NULL
                AND Sha256 IS NULL AND StoragePath IS NULL)),
        CONSTRAINT CK_FileAttachment_FileName CHECK (LEN(FileName) > 0),
        CONSTRAINT CK_FileAttachment_StorageLocation CHECK (StorageLocation IS NULL OR LEN(StorageLocation) > 0),
        CONSTRAINT CK_FileAttachment_SizeBytes CHECK (SizeBytes IS NULL OR SizeBytes > 0),
        -- Lower-case hex only, and the path is always <hash 0-1>/<hash 2-3>/<hash>: the download
        -- handler can then never be pointed outside UPLOADS_DIR by a stored value.
        CONSTRAINT CK_FileAttachment_Sha256 CHECK (
            Sha256 IS NULL OR (LEN(Sha256) = 64 AND Sha256 COLLATE Latin1_General_BIN NOT LIKE '%[^0-9a-f]%')),
        CONSTRAINT CK_FileAttachment_StoragePath CHECK (
            StoragePath IS NULL
            OR StoragePath = LEFT(Sha256, 2) + '/' + SUBSTRING(Sha256, 3, 2) + '/' + Sha256)
    );
    -- Dedupe and the orphan sweep look files up by hash; the quota sums a project's live bytes.
    CREATE INDEX IX_FileAttachment_Sha256 ON app.FileAttachment (Sha256, IsDeleted) INCLUDE (DeletedAtUtc);
    CREATE INDEX IX_FileAttachment_ProjectId ON app.FileAttachment (ProjectId, IsDeleted) INCLUDE (SizeBytes);
END;
GO

IF OBJECT_ID(N'app.DailyActivityFile', N'U') IS NULL
BEGIN
    CREATE TABLE app.DailyActivityFile (
        DailyActivityId  INT NOT NULL
            CONSTRAINT FK_DailyActivityFile_DailyActivity REFERENCES app.DailyActivity (DailyActivityId),
        FileAttachmentId INT NOT NULL
            CONSTRAINT FK_DailyActivityFile_FileAttachment REFERENCES app.FileAttachment (FileAttachmentId),
        CONSTRAINT PK_DailyActivityFile PRIMARY KEY (DailyActivityId, FileAttachmentId),
        CONSTRAINT UQ_DailyActivityFile_FileAttachment UNIQUE (FileAttachmentId)
    );
END;
GO
