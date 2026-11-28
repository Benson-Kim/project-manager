-- usp_PageNote_Create — attaches a small plain-text page note to a live location.
-- Requires Contributor+ (page-notes:create) on project/shared spaces (any active user on personal
-- pages), enforces per-creator caps of 20 per location and 500 per project under sp_getapplock
-- (live notes only: a note whose location or project is gone does not count), and audits.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_PageNote_Create
    @ModuleKey   NVARCHAR(40),
    @ProjectId   INT            = NULL,
    @EntityId    INT            = NULL,
    @SubEntityId INT            = NULL,
    @AnchorKind  NVARCHAR(24),
    @AnchorKey   NVARCHAR(80)   = NULL,
    @AnchorLabel NVARCHAR(120)  = NULL,
    @Body        NVARCHAR(1000),
    @Color       NVARCHAR(20)   = N'yellow',
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @LiveProjectId INT, @IsGlobalPersonal BIT;
    EXEC dbo.usp_PageNote_AssertAccess
         @ModuleKey = @ModuleKey, @StoredProjectId = @ProjectId,
         @EntityId = @EntityId, @SubEntityId = @SubEntityId, @AnchorKey = @AnchorKey,
         @ActorUserId = @ActorUserId, @MinLevel = N'Contributor', @Permission = N'page-notes:create',
         @RequireMatch = 1, @LiveProjectId = @LiveProjectId OUTPUT, @IsGlobalPersonal = @IsGlobalPersonal OUTPUT;

    SET @Body = NULLIF(LTRIM(RTRIM(@Body)), N'');
    SET @AnchorLabel = NULLIF(LTRIM(RTRIM(@AnchorLabel)), N'');
    SET @AnchorKey = NULLIF(LTRIM(RTRIM(@AnchorKey)), N'');
    SET @Color = ISNULL(NULLIF(LTRIM(RTRIM(@Color)), N''), N'yellow');

    IF @Body IS NULL OR LEN(@Body) > 1000 OR (@AnchorLabel IS NOT NULL AND LEN(@AnchorLabel) > 120)
        THROW 50004, N'VALIDATION:Check the note length', 1;
    IF @AnchorKind NOT IN (N'page', N'section', N'record', N'subrecord')
        THROW 50004, N'VALIDATION:Unknown anchor kind', 1;
    IF @AnchorKey IS NOT NULL AND (LEN(@AnchorKey) > 80 OR @AnchorKey COLLATE Latin1_General_BIN2 LIKE N'%[^-a-z0-9:_]%')
        THROW 50004, N'VALIDATION:Invalid anchor key', 1;
    IF @Color NOT IN (N'yellow', N'blue', N'green', N'orange', N'purple', N'gray')
        THROW 50004, N'VALIDATION:Unknown colour', 1;
    IF @Body COLLATE Latin1_General_BIN2 LIKE N'%<[A-Za-z!/]%'
       OR (@AnchorLabel IS NOT NULL AND @AnchorLabel COLLATE Latin1_General_BIN2 LIKE N'%<[A-Za-z!/]%')
        THROW 50004, N'VALIDATION:HTML is not allowed in page notes', 1;

    BEGIN TRAN;

    DECLARE @ProjLock NVARCHAR(64) = CONCAT(
        N'pn:proj:', ISNULL(CAST(@LiveProjectId AS NVARCHAR(12)), N'none'), N':', @ActorUserId
    );
    DECLARE @LockRes INT;
    EXEC @LockRes = sp_getapplock @Resource = @ProjLock, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
    IF @LockRes < 0 THROW 50999, N'INTERNAL:Page note lock busy', 1;

    DECLARE @LocLock NVARCHAR(220) = CONCAT(
        N'pn:loc:', @ModuleKey, N':', ISNULL(CAST(@LiveProjectId AS NVARCHAR(12)), N'n'),
        N':', ISNULL(CAST(@EntityId AS NVARCHAR(12)), N'n'),
        N':', ISNULL(CAST(@SubEntityId AS NVARCHAR(12)), N'n'),
        N':', ISNULL(@AnchorKey, N''),
        N':', @ActorUserId
    );
    EXEC @LockRes = sp_getapplock @Resource = @LocLock, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
    IF @LockRes < 0 THROW 50999, N'INTERNAL:Page note lock busy', 1;

    DECLARE @LocCount INT = (
        SELECT COUNT(*)
        FROM app.PageNote pn
        WHERE pn.IsDeleted = 0
          AND pn.CreatedBy = @ActorUserId
          AND pn.ModuleKey = @ModuleKey
          AND ISNULL(pn.ProjectId, -1) = ISNULL(@LiveProjectId, -1)
          AND ISNULL(pn.EntityId, -1) = ISNULL(@EntityId, -1)
          AND ISNULL(pn.SubEntityId, -1) = ISNULL(@SubEntityId, -1)
          AND ISNULL(pn.AnchorKey, N'') = ISNULL(@AnchorKey, N'')
    );
    IF @LocCount >= 20
        THROW 50007, N'LIMIT_REACHED:This place already holds 20 page notes', 1;

    BEGIN
        DECLARE @ProjCount INT = (
            SELECT COUNT(*)
            FROM app.PageNote pn
            WHERE pn.IsDeleted = 0 AND ISNULL(pn.ProjectId, -1) = ISNULL(@LiveProjectId, -1)
              AND pn.CreatedBy = @ActorUserId
              AND EXISTS (
                  SELECT 1
                  FROM dbo.ufn_CrossLink_ResolveEndpoint(
                      pn.ModuleKey, pn.ProjectId, pn.EntityId, pn.SubEntityId, pn.AnchorKey, N'Admin', @ActorUserId
                  ) AS live
                  WHERE live.AccessLevel IS NOT NULL
              )
        );
        IF @ProjCount >= 500
        BEGIN
            IF @LiveProjectId IS NULL
                THROW 50007, N'LIMIT_REACHED:Your personal pages have reached the page note limit', 1;
            THROW 50007, N'LIMIT_REACHED:This project has reached the page note limit', 1;
        END;
    END;

    INSERT INTO app.PageNote (
        ModuleKey, ProjectId, EntityId, SubEntityId, AnchorKind, AnchorKey, AnchorLabel,
        Body, Color, CreatedBy
    )
    VALUES (
        @ModuleKey, @LiveProjectId, @EntityId, @SubEntityId, @AnchorKind, @AnchorKey, @AnchorLabel,
        @Body, @Color, @ActorUserId
    );

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (
        @ActorUserId, N'Create', N'app.PageNote', CAST(@Id AS NVARCHAR(64)),
        (SELECT PageNoteId, ModuleKey, ProjectId, EntityId, SubEntityId, AnchorKind, AnchorKey, AnchorLabel, Body, Color
         FROM app.PageNote WHERE PageNoteId = @Id
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
    WHERE PageNoteId = @Id;
END;
GO
