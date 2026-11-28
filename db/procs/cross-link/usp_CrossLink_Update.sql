-- usp_CrossLink_Update — edits a 1-to-1 cross-link's title, note, or colour (never its endpoints)
-- with optimistic RowVer (50002), live-project healing, and in-transaction AuditLog.
-- CROSS_SCOPE (ADR-0074): asserts Contributor+ (cross-links:update) on BOTH live ends BEFORE checking
-- RowVer so non-members cannot probe RowVer existence.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_CrossLink_Update
    @CrossLinkId INT,
    @LinkTitle   NVARCHAR(120),
    @NoteText    NVARCHAR(500) = NULL,
    @Color       NVARCHAR(20)  = N'yellow',
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @LinkTitle = NULLIF(LTRIM(RTRIM(@LinkTitle)), N'');
    SET @NoteText = NULLIF(LTRIM(RTRIM(@NoteText)), N'');
    SET @Color = ISNULL(NULLIF(LTRIM(RTRIM(@Color)), N''), N'yellow');

    IF @LinkTitle IS NULL OR LEN(@LinkTitle) > 120 OR (@NoteText IS NOT NULL AND LEN(@NoteText) > 500)
        THROW 50004, N'VALIDATION:Check the title and note lengths', 1;
    IF @Color NOT IN (N'yellow', N'blue', N'green', N'orange', N'purple', N'gray')
        THROW 50004, N'VALIDATION:Unknown colour', 1;
    IF @LinkTitle COLLATE Latin1_General_BIN2 LIKE N'%<[A-Za-z!/]%'
       OR (@NoteText IS NOT NULL AND @NoteText COLLATE Latin1_General_BIN2 LIKE N'%<[A-Za-z!/]%')
        THROW 50004, N'VALIDATION:HTML is not allowed in cross-link text', 1;

    BEGIN TRAN;

    DECLARE @CurrentVer BIGINT,
            @EndAModule NVARCHAR(40), @EndAProjectId INT, @EndAEntityId INT, @EndASubEntityId INT, @EndAAnchorKey NVARCHAR(80),
            @EndBModule NVARCHAR(40), @EndBProjectId INT, @EndBEntityId INT, @EndBSubEntityId INT, @EndBAnchorKey NVARCHAR(80),
            @CreatedBy INT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT),
           @EndAModule = EndAModule,
           @EndAProjectId = EndAProjectId,
           @EndAEntityId = EndAEntityId,
           @EndASubEntityId = EndASubEntityId,
           @EndAAnchorKey = EndAAnchorKey,
           @EndBModule = EndBModule,
           @EndBProjectId = EndBProjectId,
           @EndBEntityId = EndBEntityId,
           @EndBSubEntityId = EndBSubEntityId,
           @EndBAnchorKey = EndBAnchorKey,
           @CreatedBy = CreatedBy
    FROM app.CrossLink WITH (UPDLOCK, HOLDLOCK)
    WHERE CrossLinkId = @CrossLinkId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Cross-link not found', 1;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    -- Check Viewer+ visibility on BOTH live ends first via ufn_CrossLink_ResolveEndpoint so
    -- non-members of either end get 50001 NOT_FOUND before Contributor write checks (ADR-0040),
    -- while preserving one AssertAccess call per scope for proc-access-levels guarantees.
    IF NOT EXISTS (
        SELECT 1
        FROM dbo.ufn_CrossLink_ResolveEndpoint(
            @EndAModule, @EndAProjectId, @EndAEntityId, @EndASubEntityId, @EndAAnchorKey, @ActorRole, @ActorUserId
        ) rA
        CROSS APPLY dbo.ufn_CrossLink_ResolveEndpoint(
            @EndBModule, @EndBProjectId, @EndBEntityId, @EndBSubEntityId, @EndBAnchorKey, @ActorRole, @ActorUserId
        ) rB
        WHERE rA.AccessLevel IS NOT NULL AND rB.AccessLevel IS NOT NULL
    )
        THROW 50001, N'NOT_FOUND:Cross-link target not found', 1;

    DECLARE @LiveProjectA INT, @LiveProjectB INT;
    EXEC dbo.usp_CrossLink_AssertAccess
         @ModuleKey = @EndAModule, @StoredProjectId = @EndAProjectId,
         @EntityId = @EndAEntityId, @SubEntityId = @EndASubEntityId, @AnchorKey = @EndAAnchorKey,
         @ActorUserId = @ActorUserId, @MinLevel = N'Contributor', @Permission = N'cross-links:update',
         @CreatedBy = @CreatedBy, @LiveProjectId = @LiveProjectA OUTPUT;

    EXEC dbo.usp_CrossLink_AssertAccess
         @ModuleKey = @EndBModule, @StoredProjectId = @EndBProjectId,
         @EntityId = @EndBEntityId, @SubEntityId = @EndBSubEntityId, @AnchorKey = @EndBAnchorKey,
         @ActorUserId = @ActorUserId, @MinLevel = N'Contributor', @Permission = N'cross-links:update',
         @CreatedBy = @CreatedBy, @LiveProjectId = @LiveProjectB OUTPUT;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Cross-link was modified by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) = (
        SELECT CrossLinkId, EndAProjectId, EndBProjectId, LinkTitle, NoteText, Color
        FROM app.CrossLink WHERE CrossLinkId = @CrossLinkId
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
    );

    UPDATE app.CrossLink SET
        EndAProjectId = @LiveProjectA,
        EndBProjectId = @LiveProjectB,
        LinkTitle     = @LinkTitle,
        NoteText      = @NoteText,
        Color         = @Color,
        UpdatedAtUtc  = SYSUTCDATETIME(),
        UpdatedBy     = @ActorUserId
    WHERE CrossLinkId = @CrossLinkId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Cross-link was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (
        @ActorUserId, N'Update', N'app.CrossLink', CAST(@CrossLinkId AS NVARCHAR(64)), @Before,
        (SELECT CrossLinkId, EndAProjectId, EndBProjectId, LinkTitle, NoteText, Color
         FROM app.CrossLink WHERE CrossLinkId = @CrossLinkId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
    );

    COMMIT;

    SELECT CrossLinkId,
           EndAModule,
           EndAProjectId,
           EndAEntityId,
           EndASubEntityId,
           EndAAnchorKind,
           EndAAnchorKey,
           EndALabel,
           EndBModule,
           EndBProjectId,
           EndBEntityId,
           EndBSubEntityId,
           EndBAnchorKind,
           EndBAnchorKey,
           EndBLabel,
           LinkTitle,
           NoteText,
           Color,
           CreatedBy,
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.CrossLink
    WHERE CrossLinkId = @CrossLinkId;
END;
GO
