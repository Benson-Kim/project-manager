-- usp_Search_Global — cross-project search across Keywords, Stakeholders, and Suppliers (ADR-0073).
-- Actor role is resolved in-proc via usp_User_GetActorRole (never trusted from caller).
-- Row-level access:
--   * Keyword: LEFT JOIN app.Project p + ufn_AccessLevel_Resolve(..., 1) + (k.ProjectId IS NULL OR p.IsDeleted = 0)
--     so shared projectless keywords stay searchable while soft-deleted projects are excluded even for Admin.
--   * Stakeholder / Supplier: INNER JOIN app.Project p ON p.ProjectId = ... AND p.IsDeleted = 0
--     + ufn_AccessLevel_Resolve(..., 0) so only active accessible projects are returned.
-- LIKE wildcards in @Search are escaped (\ first, then %, _, [) into @Escaped NVARCHAR(200)
-- to avoid 100-char truncation. @Kinds is strictly allowlisted (no empty tokens, no dynamic SQL).
-- Each kind executes as a derived SELECT TOP (@TopPerKind) branch combined via UNION ALL.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Search_Global
    @ActorUserId INT,
    @Search      NVARCHAR(100),
    @Kinds       NVARCHAR(200) = NULL,
    @TopPerKind  INT           = 25
AS
BEGIN
    SET NOCOUNT ON;

    -- The actor's role is read from auth.User, never trusted from the caller.
    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');
    IF @Search IS NULL OR LEN(@Search) < 2
        THROW 50004, N'VALIDATION:Search term must be at least 2 characters', 1;

    DECLARE @Escaped NVARCHAR(200) =
        REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[');

    SET @TopPerKind = CASE
        WHEN @TopPerKind IS NULL OR @TopPerKind < 1 THEN 25
        WHEN @TopPerKind > 50 THEN 50
        ELSE @TopPerKind
    END;

    DECLARE @IncludeKeyword     BIT = 0;
    DECLARE @IncludeStakeholder BIT = 0;
    DECLARE @IncludeSupplier    BIT = 0;

    SET @Kinds = NULLIF(LTRIM(RTRIM(@Kinds)), N'');
    IF @Kinds IS NULL
    BEGIN
        SET @IncludeKeyword     = 1;
        SET @IncludeStakeholder = 1;
        SET @IncludeSupplier    = 1;
    END
    ELSE
    BEGIN
        DECLARE @ParsedKinds TABLE (Kind NVARCHAR(50) NOT NULL);
        INSERT INTO @ParsedKinds (Kind)
        SELECT LOWER(LTRIM(RTRIM([value])))
        FROM STRING_SPLIT(@Kinds, N',');

        IF NOT EXISTS (SELECT 1 FROM @ParsedKinds)
           OR EXISTS (
               SELECT 1
               FROM @ParsedKinds
               WHERE Kind NOT IN (N'keyword', N'stakeholder', N'supplier')
           )
            THROW 50004, N'VALIDATION:Invalid search kind', 1;

        IF EXISTS (SELECT 1 FROM @ParsedKinds WHERE Kind = N'keyword')     SET @IncludeKeyword     = 1;
        IF EXISTS (SELECT 1 FROM @ParsedKinds WHERE Kind = N'stakeholder') SET @IncludeStakeholder = 1;
        IF EXISTS (SELECT 1 FROM @ParsedKinds WHERE Kind = N'supplier')    SET @IncludeSupplier    = 1;
    END;

    DECLARE @DotSep NVARCHAR(3) = N' ' + NCHAR(183) + N' ';

    SELECT Kind, Id, ProjectId, ProjectName, Title, Snippet
    FROM (
        SELECT TOP (@TopPerKind)
               N'keyword'                                 AS Kind,
               k.KeywordId                                AS Id,
               p.ProjectId                                AS ProjectId,
               p.ProjectName                              AS ProjectName,
               k.[Keyword]                                AS Title,
               NULLIF(LTRIM(RTRIM(k.[Definition])), N'')  AS Snippet
        FROM app.Keyword AS k
        LEFT JOIN app.Project AS p ON p.ProjectId = k.ProjectId
        CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, k.ProjectId, 1) AS acc
        WHERE @IncludeKeyword = 1
          AND k.IsDeleted = 0
          AND (k.ProjectId IS NULL OR p.IsDeleted = 0)
          AND acc.AccessLevel IS NOT NULL
          AND (k.[Keyword] LIKE N'%' + @Escaped + N'%' ESCAPE N'\'
               OR k.[Definition] LIKE N'%' + @Escaped + N'%' ESCAPE N'\')
        ORDER BY
            CASE WHEN k.[Keyword] = @Search THEN 0
                 WHEN k.[Keyword] LIKE @Escaped + N'%' ESCAPE N'\' THEN 1
                 ELSE 2 END,
            k.[Keyword] ASC,
            CASE WHEN p.ProjectId IS NULL THEN 1 ELSE 0 END,
            p.ProjectName ASC,
            k.KeywordId ASC
    ) AS kw
    UNION ALL
    SELECT Kind, Id, ProjectId, ProjectName, Title, Snippet
    FROM (
        SELECT TOP (@TopPerKind)
               N'stakeholder'                             AS Kind,
               s.StakeholderId                            AS Id,
               p.ProjectId                                AS ProjectId,
               p.ProjectName                              AS ProjectName,
               CONCAT(s.[FirstName], CASE WHEN s.[LastName] IS NOT NULL AND s.[LastName] <> N'' THEN N' ' + s.[LastName] ELSE N'' END) AS Title,
               NULLIF(CONCAT_WS(@DotSep, NULLIF(LTRIM(RTRIM(s.[ProjectRole])), N''), NULLIF(LTRIM(RTRIM(s.[DepartmentOrganization])), N''), NULLIF(LTRIM(RTRIM(s.[EmailAddress])), N'')), N'') AS Snippet
        FROM app.Stakeholder AS s
        INNER JOIN app.Project AS p ON p.ProjectId = s.ProjectId AND p.IsDeleted = 0
        CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) AS acc
        WHERE @IncludeStakeholder = 1
          AND s.IsDeleted = 0
          AND acc.AccessLevel IS NOT NULL
          AND (s.[FirstName] LIKE N'%' + @Escaped + N'%' ESCAPE N'\'
               OR s.[LastName] LIKE N'%' + @Escaped + N'%' ESCAPE N'\'
               OR CONCAT(s.[FirstName], CASE WHEN s.[LastName] IS NOT NULL AND s.[LastName] <> N'' THEN N' ' + s.[LastName] ELSE N'' END) LIKE N'%' + @Escaped + N'%' ESCAPE N'\'
               OR s.[ProjectRole] LIKE N'%' + @Escaped + N'%' ESCAPE N'\'
               OR s.[DepartmentOrganization] LIKE N'%' + @Escaped + N'%' ESCAPE N'\'
               OR s.[EmailAddress] LIKE N'%' + @Escaped + N'%' ESCAPE N'\')
        ORDER BY
            CASE WHEN CONCAT(s.[FirstName], CASE WHEN s.[LastName] IS NOT NULL AND s.[LastName] <> N'' THEN N' ' + s.[LastName] ELSE N'' END) = @Search
                      OR s.[FirstName] = @Search OR s.[LastName] = @Search THEN 0
                 WHEN CONCAT(s.[FirstName], CASE WHEN s.[LastName] IS NOT NULL AND s.[LastName] <> N'' THEN N' ' + s.[LastName] ELSE N'' END) LIKE @Escaped + N'%' ESCAPE N'\'
                      OR s.[LastName] LIKE @Escaped + N'%' ESCAPE N'\' THEN 1
                 ELSE 2 END,
            s.[LastName] ASC,
            s.[FirstName] ASC,
            p.ProjectName ASC,
            s.StakeholderId ASC
    ) AS sh
    UNION ALL
    SELECT Kind, Id, ProjectId, ProjectName, Title, Snippet
    FROM (
        SELECT TOP (@TopPerKind)
               N'supplier'                                AS Kind,
               sp.SupplierId                              AS Id,
               p.ProjectId                                AS ProjectId,
               p.ProjectName                              AS ProjectName,
               sp.[SupplierName]                          AS Title,
               NULLIF(CONCAT_WS(@DotSep, NULLIF(LTRIM(RTRIM(sp.[ContactPerson])), N''), NULLIF(LTRIM(RTRIM(sp.[City])), N''), NULLIF(LTRIM(RTRIM(sp.[Rating])), N'')), N'') AS Snippet
        FROM app.Supplier AS sp
        INNER JOIN app.Project AS p ON p.ProjectId = sp.ProjectId AND p.IsDeleted = 0
        CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) AS acc
        WHERE @IncludeSupplier = 1
          AND sp.IsDeleted = 0
          AND acc.AccessLevel IS NOT NULL
          AND (sp.[SupplierName] LIKE N'%' + @Escaped + N'%' ESCAPE N'\'
               OR sp.[ContactPerson] LIKE N'%' + @Escaped + N'%' ESCAPE N'\'
               OR sp.[EmailAddress] LIKE N'%' + @Escaped + N'%' ESCAPE N'\'
               OR sp.[City] LIKE N'%' + @Escaped + N'%' ESCAPE N'\')
        ORDER BY
            CASE WHEN sp.[SupplierName] = @Search THEN 0
                 WHEN sp.[SupplierName] LIKE @Escaped + N'%' ESCAPE N'\' THEN 1
                 ELSE 2 END,
            sp.[SupplierName] ASC,
            p.ProjectName ASC,
            sp.SupplierId ASC
    ) AS sp;
END;
GO
