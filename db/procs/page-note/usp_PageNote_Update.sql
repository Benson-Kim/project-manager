-- usp_PageNote_Update — updates a page note's plain text and colour with RowVer (50002),
-- live-project healing, and in-transaction AuditLog.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_PageNote_Update
    @PageNoteId  INT,
    @Body        NVARCHAR(1000),
    @Color       NVARCHAR(20) = N'yellow',
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Body = NULLIF(LTRIM(RTRIM(@Body)), N'');
    SET @Color = ISNULL(NULLIF(LTRIM(RTRIM(@Color)), N''), N'yellow');

    IF @Body IS NULL OR LEN(@Body) > 1000
        THROW 50004, N'VALIDATION:Check the note length', 1;
    IF @Color NOT IN (N'yellow', N'blue', N'green', N'orange', N'purple', N'gray')
        THROW 50004, N'VALIDATION:Unknown colour', 1;
    IF @Body COLLATE Latin1_General_BIN2 LIKE N'%<[A-Za-z!/]%'
        THROW 50004, N'VALIDATION:HTML is not allowed in page notes', 1;

    BEGIN TRAN;

    DECLARE @CurrentVer BIGINT, @ModuleKey NVARCHAR(40), @StoredProjectId INT,
            @EntityId INT, @SubEntityId INT, @AnchorKey NVARCHAR(80), @CreatedBy INT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT),
           @ModuleKey = ModuleKey,
           @StoredProjectId = ProjectId,
           @EntityId = EntityId,
           @SubEntityId = SubEntityId,
           @AnchorKey = AnchorKey,
           @CreatedBy = CreatedBy
    FROM app.PageNote WITH (UPDLOCK, HOLDLOCK)
    WHERE PageNoteId = @PageNoteId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Page note not found', 1;

    DECLARE @LiveProjectId INT;
    EXEC dbo.usp_PageNote_AssertAccess
         @ModuleKey = @ModuleKey, @StoredProjectId = @StoredProjectId,
         @EntityId = @EntityId, @SubEntityId = @SubEntityId, @AnchorKey = @AnchorKey,
         @ActorUserId = @ActorUserId, @MinLevel = N'Contributor', @Permission = N'page-notes:update',
         @CreatedBy = @CreatedBy, @LiveProjectId = @LiveProjectId OUTPUT;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Page note was modified by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) = (
        SELECT PageNoteId, ProjectId, Body, Color
        FROM app.PageNote WHERE PageNoteId = @PageNoteId
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
    );

    UPDATE app.PageNote SET
        ProjectId    = @LiveProjectId,
        Body         = @Body,
        Color        = @Color,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE PageNoteId = @PageNoteId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Page note was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (
        @ActorUserId, N'Update', N'app.PageNote', CAST(@PageNoteId AS NVARCHAR(64)), @Before,
        (SELECT PageNoteId, ProjectId, Body, Color
         FROM app.PageNote WHERE PageNoteId = @PageNoteId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
    );

    COMMIT;

    SELECT PageNoteId,
           ModuleKey,
           ProjectId,
           EntityId,
           SubEntityId,
           AnchorKind,
           AnchorKey,
           AnchorLabel,
           Body,
           Color,
           CreatedBy,
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.PageNote
    WHERE PageNoteId = @PageNoteId;
END;
GO
