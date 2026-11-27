-- usp_CrossLink_Create — creates a 1-to-1 cross-link between two distinct live endpoints.
-- CROSS_SCOPE (ADR-0074 Policy 1): requires Contributor+ (cross-links:create) on BOTH live ends.
-- Enforces plain-text/length validation, non-self check, and per-creator live per-endpoint (25) /
-- per-project (500) caps under deadlock-free ordered sp_getapplock inside BEGIN TRAN ... COMMIT + AuditLog.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_CrossLink_Create
    @EndAModule      NVARCHAR(40),
    @EndAProjectId   INT           = NULL,
    @EndAEntityId    INT           = NULL,
    @EndASubEntityId INT           = NULL,
    @EndAAnchorKind  NVARCHAR(24),
    @EndAAnchorKey   NVARCHAR(80)  = NULL,
    @EndALabel       NVARCHAR(120),
    @EndBModule      NVARCHAR(40),
    @EndBProjectId   INT           = NULL,
    @EndBEntityId    INT           = NULL,
    @EndBSubEntityId INT           = NULL,
    @EndBAnchorKind  NVARCHAR(24),
    @EndBAnchorKey   NVARCHAR(80)  = NULL,
    @EndBLabel       NVARCHAR(120),
    @LinkTitle       NVARCHAR(120),
    @NoteText        NVARCHAR(500) = NULL,
    @Color           NVARCHAR(20)  = N'yellow',
    @ActorUserId     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @LiveProjectA INT, @LiveProjectB INT;
    EXEC dbo.usp_CrossLink_AssertAccess
         @ModuleKey = @EndAModule, @StoredProjectId = @EndAProjectId,
         @EntityId = @EndAEntityId, @SubEntityId = @EndASubEntityId, @AnchorKey = @EndAAnchorKey,
         @ActorUserId = @ActorUserId, @MinLevel = N'Contributor', @Permission = N'cross-links:create',
         @RequireMatch = 1, @LiveProjectId = @LiveProjectA OUTPUT;

    EXEC dbo.usp_CrossLink_AssertAccess
         @ModuleKey = @EndBModule, @StoredProjectId = @EndBProjectId,
         @EntityId = @EndBEntityId, @SubEntityId = @EndBSubEntityId, @AnchorKey = @EndBAnchorKey,
         @ActorUserId = @ActorUserId, @MinLevel = N'Contributor', @Permission = N'cross-links:create',
         @RequireMatch = 1, @LiveProjectId = @LiveProjectB OUTPUT;

    SET @EndALabel = NULLIF(LTRIM(RTRIM(@EndALabel)), N'');
    SET @EndBLabel = NULLIF(LTRIM(RTRIM(@EndBLabel)), N'');
    SET @LinkTitle = NULLIF(LTRIM(RTRIM(@LinkTitle)), N'');
    SET @NoteText = NULLIF(LTRIM(RTRIM(@NoteText)), N'');
    SET @EndAAnchorKey = NULLIF(LTRIM(RTRIM(@EndAAnchorKey)), N'');
    SET @EndBAnchorKey = NULLIF(LTRIM(RTRIM(@EndBAnchorKey)), N'');
    SET @Color = ISNULL(NULLIF(LTRIM(RTRIM(@Color)), N''), N'yellow');

    IF @EndALabel IS NULL OR LEN(@EndALabel) > 120
       OR @EndBLabel IS NULL OR LEN(@EndBLabel) > 120
       OR @LinkTitle IS NULL OR LEN(@LinkTitle) > 120
       OR (@NoteText IS NOT NULL AND LEN(@NoteText) > 500)
        THROW 50004, N'VALIDATION:Check the title, labels and note lengths', 1;

    IF @EndAAnchorKind NOT IN (N'page', N'section', N'record', N'subrecord')
       OR @EndBAnchorKind NOT IN (N'page', N'section', N'record', N'subrecord')
        THROW 50004, N'VALIDATION:Unknown anchor kind', 1;

    IF (@EndAAnchorKey IS NOT NULL AND (LEN(@EndAAnchorKey) > 80 OR @EndAAnchorKey COLLATE Latin1_General_BIN2 LIKE N'%[^-a-z0-9:_]%'))
       OR (@EndBAnchorKey IS NOT NULL AND (LEN(@EndBAnchorKey) > 80 OR @EndBAnchorKey COLLATE Latin1_General_BIN2 LIKE N'%[^-a-z0-9:_]%'))
        THROW 50004, N'VALIDATION:Invalid anchor key', 1;

    IF @Color NOT IN (N'yellow', N'blue', N'green', N'orange', N'purple', N'gray')
        THROW 50004, N'VALIDATION:Unknown colour', 1;

    -- Plain-text invariant: refuse HTML tags in any text column.
    IF @EndALabel COLLATE Latin1_General_BIN2 LIKE N'%<[A-Za-z!/]%'
       OR @EndBLabel COLLATE Latin1_General_BIN2 LIKE N'%<[A-Za-z!/]%'
       OR @LinkTitle COLLATE Latin1_General_BIN2 LIKE N'%<[A-Za-z!/]%'
       OR (@NoteText IS NOT NULL AND @NoteText COLLATE Latin1_General_BIN2 LIKE N'%<[A-Za-z!/]%')
        THROW 50004, N'VALIDATION:HTML is not allowed in cross-link text', 1;

    IF @EndAModule = @EndBModule
       AND ISNULL(@LiveProjectA, -1) = ISNULL(@LiveProjectB, -1)
       AND ISNULL(@EndAEntityId, -1) = ISNULL(@EndBEntityId, -1)
       AND ISNULL(@EndASubEntityId, -1) = ISNULL(@EndBSubEntityId, -1)
       AND ISNULL(@EndAAnchorKey, N'') = ISNULL(@EndBAnchorKey, N'')
        THROW 50004, N'VALIDATION:Choose two different places to link', 1;

    BEGIN TRAN;

    -- Deadlock-free canonical lock ordering across project buckets then endpoint locations.
    DECLARE @ProjLockA NVARCHAR(64) = CONCAT(
        N'cl:proj:', ISNULL(CAST(@LiveProjectA AS NVARCHAR(12)), N'none'), N':', @ActorUserId
    );
    DECLARE @ProjLockB NVARCHAR(64) = CONCAT(
        N'cl:proj:', ISNULL(CAST(@LiveProjectB AS NVARCHAR(12)), N'none'), N':', @ActorUserId
    );
    DECLARE @ProjFirst NVARCHAR(64) = CASE WHEN @ProjLockA <= @ProjLockB THEN @ProjLockA ELSE @ProjLockB END;
    DECLARE @ProjSecond NVARCHAR(64) = CASE WHEN @ProjLockA <= @ProjLockB THEN @ProjLockB ELSE @ProjLockA END;

    DECLARE @LockRes INT;
    EXEC @LockRes = sp_getapplock @Resource = @ProjFirst, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
    IF @LockRes < 0 THROW 50999, N'INTERNAL:Cross-link lock busy', 1;
    IF @ProjSecond <> @ProjFirst
    BEGIN
        EXEC @LockRes = sp_getapplock @Resource = @ProjSecond, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
        IF @LockRes < 0 THROW 50999, N'INTERNAL:Cross-link lock busy', 1;
    END;

    DECLARE @LocKeyA NVARCHAR(220) = CONCAT(
        N'cl:loc:', @EndAModule, N':', ISNULL(CAST(@LiveProjectA AS NVARCHAR(12)), N'n'),
        N':', ISNULL(CAST(@EndAEntityId AS NVARCHAR(12)), N'n'),
        N':', ISNULL(CAST(@EndASubEntityId AS NVARCHAR(12)), N'n'),
        N':', ISNULL(@EndAAnchorKey, N''),
        N':', @ActorUserId
    );
    DECLARE @LocKeyB NVARCHAR(220) = CONCAT(
        N'cl:loc:', @EndBModule, N':', ISNULL(CAST(@LiveProjectB AS NVARCHAR(12)), N'n'),
        N':', ISNULL(CAST(@EndBEntityId AS NVARCHAR(12)), N'n'),
        N':', ISNULL(CAST(@EndBSubEntityId AS NVARCHAR(12)), N'n'),
        N':', ISNULL(@EndBAnchorKey, N''),
        N':', @ActorUserId
    );
    DECLARE @LocFirst NVARCHAR(220) = CASE WHEN @LocKeyA <= @LocKeyB THEN @LocKeyA ELSE @LocKeyB END;
    DECLARE @LocSecond NVARCHAR(220) = CASE WHEN @LocKeyA <= @LocKeyB THEN @LocKeyB ELSE @LocKeyA END;

    EXEC @LockRes = sp_getapplock @Resource = @LocFirst, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
    IF @LockRes < 0 THROW 50999, N'INTERNAL:Cross-link lock busy', 1;
    IF @LocSecond <> @LocFirst
    BEGIN
        EXEC @LockRes = sp_getapplock @Resource = @LocSecond, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
        IF @LockRes < 0 THROW 50999, N'INTERNAL:Cross-link lock busy', 1;
    END;

    -- Caps are per creator and count live links only: a link whose end or project is gone is skipped.
    DECLARE @MyLive TABLE (
        EndAModule NVARCHAR(40), EndAProjectId INT, EndAEntityId INT, EndASubEntityId INT, EndAAnchorKey NVARCHAR(80),
        EndBModule NVARCHAR(40), EndBProjectId INT, EndBEntityId INT, EndBSubEntityId INT, EndBAnchorKey NVARCHAR(80)
    );
    INSERT INTO @MyLive
    SELECT cl.EndAModule, cl.EndAProjectId, cl.EndAEntityId, cl.EndASubEntityId, cl.EndAAnchorKey,
           cl.EndBModule, cl.EndBProjectId, cl.EndBEntityId, cl.EndBSubEntityId, cl.EndBAnchorKey
    FROM app.CrossLink cl
    WHERE cl.IsDeleted = 0
      AND cl.CreatedBy = @ActorUserId
      AND (ISNULL(cl.EndAProjectId, -1) IN (ISNULL(@LiveProjectA, -1), ISNULL(@LiveProjectB, -1))
           OR ISNULL(cl.EndBProjectId, -1) IN (ISNULL(@LiveProjectA, -1), ISNULL(@LiveProjectB, -1)))
      AND EXISTS (
          SELECT 1 FROM dbo.ufn_CrossLink_ResolveEndpoint(
              cl.EndAModule, cl.EndAProjectId, cl.EndAEntityId, cl.EndASubEntityId, cl.EndAAnchorKey, N'Admin', @ActorUserId
          ) AS liveA WHERE liveA.AccessLevel IS NOT NULL
      )
      AND EXISTS (
          SELECT 1 FROM dbo.ufn_CrossLink_ResolveEndpoint(
              cl.EndBModule, cl.EndBProjectId, cl.EndBEntityId, cl.EndBSubEntityId, cl.EndBAnchorKey, N'Admin', @ActorUserId
          ) AS liveB WHERE liveB.AccessLevel IS NOT NULL
      );

    DECLARE @CountEndA INT = (
        SELECT COUNT(*)
        FROM @MyLive cl
        WHERE (
              (cl.EndAModule = @EndAModule
               AND ISNULL(cl.EndAProjectId, -1) = ISNULL(@LiveProjectA, -1)
               AND ISNULL(cl.EndAEntityId, -1) = ISNULL(@EndAEntityId, -1)
               AND ISNULL(cl.EndASubEntityId, -1) = ISNULL(@EndASubEntityId, -1)
               AND ISNULL(cl.EndAAnchorKey, N'') = ISNULL(@EndAAnchorKey, N''))
              OR
              (cl.EndBModule = @EndAModule
               AND ISNULL(cl.EndBProjectId, -1) = ISNULL(@LiveProjectA, -1)
               AND ISNULL(cl.EndBEntityId, -1) = ISNULL(@EndAEntityId, -1)
               AND ISNULL(cl.EndBSubEntityId, -1) = ISNULL(@EndASubEntityId, -1)
               AND ISNULL(cl.EndBAnchorKey, N'') = ISNULL(@EndAAnchorKey, N''))
          )
    );
    IF @CountEndA >= 25
        THROW 50007, N'LIMIT_REACHED:This place already holds 25 cross-links', 1;

    DECLARE @CountEndB INT = (
        SELECT COUNT(*)
        FROM @MyLive cl
        WHERE (
              (cl.EndAModule = @EndBModule
               AND ISNULL(cl.EndAProjectId, -1) = ISNULL(@LiveProjectB, -1)
               AND ISNULL(cl.EndAEntityId, -1) = ISNULL(@EndBEntityId, -1)
               AND ISNULL(cl.EndASubEntityId, -1) = ISNULL(@EndBSubEntityId, -1)
               AND ISNULL(cl.EndAAnchorKey, N'') = ISNULL(@EndBAnchorKey, N''))
              OR
              (cl.EndBModule = @EndBModule
               AND ISNULL(cl.EndBProjectId, -1) = ISNULL(@LiveProjectB, -1)
               AND ISNULL(cl.EndBEntityId, -1) = ISNULL(@EndBEntityId, -1)
               AND ISNULL(cl.EndBSubEntityId, -1) = ISNULL(@EndBSubEntityId, -1)
               AND ISNULL(cl.EndBAnchorKey, N'') = ISNULL(@EndBAnchorKey, N''))
          )
    );
    IF @CountEndB >= 25
        THROW 50007, N'LIMIT_REACHED:The destination already holds 25 cross-links', 1;

    IF @LiveProjectA IS NOT NULL
    BEGIN
        DECLARE @CountProjA INT = (
            SELECT COUNT(*) FROM @MyLive
            WHERE EndAProjectId = @LiveProjectA OR EndBProjectId = @LiveProjectA
        );
        IF @CountProjA >= 500
            THROW 50007, N'LIMIT_REACHED:This project has reached the cross-link limit', 1;
    END;

    IF @LiveProjectB IS NOT NULL AND (@LiveProjectA IS NULL OR @LiveProjectB <> @LiveProjectA)
    BEGIN
        DECLARE @CountProjB INT = (
            SELECT COUNT(*) FROM @MyLive
            WHERE EndAProjectId = @LiveProjectB OR EndBProjectId = @LiveProjectB
        );
        IF @CountProjB >= 500
            THROW 50007, N'LIMIT_REACHED:The target project has reached the cross-link limit', 1;
    END;

    IF @LiveProjectA IS NULL OR @LiveProjectB IS NULL
    BEGIN
        DECLARE @CountPersonal INT = (
            SELECT COUNT(*) FROM @MyLive
            WHERE EndAProjectId IS NULL OR EndBProjectId IS NULL
        );
        IF @CountPersonal >= 500
            THROW 50007, N'LIMIT_REACHED:Your personal pages have reached the cross-link limit', 1;
    END;

    INSERT INTO app.CrossLink (
        EndAModule, EndAProjectId, EndAEntityId, EndASubEntityId, EndAAnchorKind, EndAAnchorKey, EndALabel,
        EndBModule, EndBProjectId, EndBEntityId, EndBSubEntityId, EndBAnchorKind, EndBAnchorKey, EndBLabel,
        LinkTitle, NoteText, Color, CreatedBy
    )
    VALUES (
        @EndAModule, @LiveProjectA, @EndAEntityId, @EndASubEntityId, @EndAAnchorKind, @EndAAnchorKey, @EndALabel,
        @EndBModule, @LiveProjectB, @EndBEntityId, @EndBSubEntityId, @EndBAnchorKind, @EndBAnchorKey, @EndBLabel,
        @LinkTitle, @NoteText, @Color, @ActorUserId
    );

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (
        @ActorUserId, N'Create', N'app.CrossLink', CAST(@Id AS NVARCHAR(64)),
        (SELECT CrossLinkId, EndAModule, EndAProjectId, EndAEntityId, EndASubEntityId, EndAAnchorKind, EndAAnchorKey, EndALabel,
                EndBModule, EndBProjectId, EndBEntityId, EndBSubEntityId, EndBAnchorKind, EndBAnchorKey, EndBLabel,
                LinkTitle, NoteText, Color
         FROM app.CrossLink WHERE CrossLinkId = @Id
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
    WHERE CrossLinkId = @Id;
END;
GO
