-- usp_Financial_Create - new project financials (ADR-0029), blank or copied from a master
-- template. The copy is a snapshot: settings, cost categories, funding sources, tax profiles
-- (the template's default first), standard lines, a line's template amount landing in the
-- first fiscal year, and the document checklist with its suggestions (ADR-0030). Later
-- template edits never reach it.
-- Access: Manager on @ProjectId with 'financials:create' (ADR-0021/0024; FORBIDDEN_ROW 50003).
-- Title 1-150 characters; @FirstFiscalYear 2000-2100, NULL = the fiscal year of today; a deleted
-- or unknown template is NOT_FOUND 50001; at most 50 live financials per project (VALIDATION,
-- counted under a lock on the project row). The template is re-checked before the copy.
-- Audited in-transaction; returns dbo.ufn_Financial_Row.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Financial_Create
    @ProjectId           INT,
    @Title               NVARCHAR(300),
    @FinancialTemplateId INT      = NULL,
    @FirstFiscalYear     SMALLINT = NULL,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:create', @AllowProjectless = 0;

    SET @Title = LTRIM(RTRIM(@Title));
    IF @Title IS NULL OR LEN(@Title) NOT BETWEEN 1 AND 150
        THROW 50004, N'VALIDATION:A title of 1 to 150 characters is required', 1;

    DECLARE @Definition NVARCHAR(MAX), @TemplateName NVARCHAR(100);
    IF @FinancialTemplateId IS NOT NULL
    BEGIN
        SELECT @Definition = [Definition], @TemplateName = [Name]
        FROM app.FinancialTemplate WHERE FinancialTemplateId = @FinancialTemplateId AND IsDeleted = 0;
        IF @Definition IS NULL
            THROW 50001, N'NOT_FOUND:Template not found', 1;
        EXEC dbo.usp_FinancialTemplate_AssertDefinition @Definition = @Definition;
    END;

    DECLARE @StartMonth TINYINT = ISNULL(TRY_CAST(JSON_VALUE(@Definition, N'$.fiscalYearStartMonth') AS TINYINT), 4);
    IF @FirstFiscalYear IS NULL
        SET @FirstFiscalYear = CASE WHEN MONTH(SYSUTCDATETIME()) >= @StartMonth
                                    THEN YEAR(SYSUTCDATETIME()) ELSE YEAR(SYSUTCDATETIME()) - 1 END;
    IF @FirstFiscalYear NOT BETWEEN 2000 AND 2100
        THROW 50004, N'VALIDATION:The first fiscal year must be from 2000 to 2100', 1;

    BEGIN TRAN;

    DECLARE @Lock INT;
    SELECT @Lock = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @ProjectId;
    IF (SELECT COUNT(*) FROM app.Financial WHERE ProjectId = @ProjectId AND IsDeleted = 0) >= 50
        THROW 50004, N'VALIDATION:A project can hold at most 50 financials', 1;

    INSERT INTO app.Financial (ProjectId, Title, TemplateName, FirstFiscalYear, HorizonYears,
                               FiscalYearStartMonth, EscalationRate, FlagThresholdRate,
                               CostCategories, FundingSources, CreatedBy)
    VALUES (@ProjectId, @Title, @TemplateName, @FirstFiscalYear,
            ISNULL(TRY_CAST(JSON_VALUE(@Definition, N'$.horizonYears') AS TINYINT), 5),
            @StartMonth,
            ISNULL(TRY_CAST(JSON_VALUE(@Definition, N'$.escalationRate') AS DECIMAL(9,6)), 0),
            ISNULL(TRY_CAST(JSON_VALUE(@Definition, N'$.flagThresholdRate') AS DECIMAL(9,6)), 0.1),
            ISNULL(JSON_QUERY(@Definition, N'$.costCategories'), N'[]'),
            ISNULL(JSON_QUERY(@Definition, N'$.fundingSources'), N'[]'),
            @ActorUserId);
    DECLARE @FinancialId INT = SCOPE_IDENTITY();

    IF @Definition IS NOT NULL
    BEGIN
        DECLARE @ProfileMap TABLE ([Key] NVARCHAR(20), FinancialTaxProfileId INT);
        MERGE app.FinancialTaxProfile AS t
        USING (
            SELECT LTRIM(RTRIM(v.[Key])) AS [Key], LTRIM(RTRIM(v.[Name])) AS [Name], v.Rate,
                   ROW_NUMBER() OVER (ORDER BY CASE WHEN v.IsDefault = 1 THEN 0 ELSE 1 END,
                                               CAST(p.[key] AS INT)) AS SortOrder
            FROM OPENJSON(@Definition, N'$.taxProfiles') AS p
            CROSS APPLY OPENJSON(p.[value]) WITH (
                [Key] NVARCHAR(20) N'$.key', [Name] NVARCHAR(100) N'$.name',
                Rate DECIMAL(9,6) N'$.rate', IsDefault BIT N'$.isDefault') AS v
        ) AS s ON 1 = 0
        WHEN NOT MATCHED THEN
            INSERT (FinancialId, [Name], Rate, SortOrder, CreatedBy)
            VALUES (@FinancialId, s.[Name], s.Rate, s.SortOrder, @ActorUserId)
        OUTPUT s.[Key], inserted.FinancialTaxProfileId INTO @ProfileMap;

        DECLARE @LineMap TABLE (Ordinal INT, FinancialLineId INT, Amount DECIMAL(19,2));
        MERGE app.FinancialLine AS t
        USING (
            SELECT CAST(l.[key] AS INT) AS Ordinal, v.[Section], LTRIM(RTRIM(v.[Description])) AS [Description],
                   NULLIF(LTRIM(RTRIM(v.CostCategory)), N'') AS CostCategory,
                   NULLIF(LTRIM(RTRIM(v.FundingSource)), N'') AS FundingSource,
                   m.FinancialTaxProfileId, ISNULL(v.IsRecurrent, 0) AS IsRecurrent, v.Amount
            FROM OPENJSON(@Definition, N'$.lines') AS l
            CROSS APPLY OPENJSON(l.[value]) WITH (
                [Section] VARCHAR(10) N'$.section', [Description] NVARCHAR(255) N'$.description',
                CostCategory NVARCHAR(150) N'$.costCategory', FundingSource NVARCHAR(150) N'$.fundingSource',
                TaxProfileKey NVARCHAR(20) N'$.taxProfileKey', IsRecurrent BIT N'$.isRecurrent',
                Amount DECIMAL(19,2) N'$.amount') AS v
            LEFT JOIN @ProfileMap AS m ON m.[Key] = LTRIM(RTRIM(v.TaxProfileKey))
        ) AS s ON 1 = 0
        WHEN NOT MATCHED THEN
            INSERT (FinancialId, [Section], [Description], CostCategory, FundingSource,
                    FinancialTaxProfileId, IsRecurrent, SortOrder, CreatedBy)
            VALUES (@FinancialId, s.[Section], s.[Description], s.CostCategory, s.FundingSource,
                    s.FinancialTaxProfileId, s.IsRecurrent, s.Ordinal + 1, @ActorUserId)
        OUTPUT s.Ordinal, inserted.FinancialLineId, s.Amount INTO @LineMap;

        INSERT INTO app.FinancialLineAmount (FinancialLineId, FiscalYear, Amount)
        SELECT FinancialLineId, @FirstFiscalYear, Amount FROM @LineMap WHERE Amount IS NOT NULL;

        INSERT INTO app.FinancialDocument (FinancialId, [Name], IsRequired, ReasonNotCreated,
                                           Suggestions, SortOrder, CreatedBy)
        SELECT @FinancialId, LTRIM(RTRIM(v.[Name])), v.IsRequired, NULLIF(LTRIM(RTRIM(v.Reason)), N''),
               ISNULL(v.Suggestions, N'[]'), CAST(d.[key] AS INT) + 1, @ActorUserId
        FROM OPENJSON(@Definition, N'$.documents') AS d
        CROSS APPLY OPENJSON(d.[value]) WITH (
            [Name] NVARCHAR(200) N'$.name', IsRequired BIT N'$.required',
            Reason NVARCHAR(2000) N'$.reason', Suggestions NVARCHAR(MAX) N'$.suggestions' AS JSON) AS v;
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Financial', CAST(@FinancialId AS NVARCHAR(64)),
            (SELECT f.*, @FinancialTemplateId AS FinancialTemplateId,
                    (SELECT COUNT(*) FROM app.FinancialLine WHERE FinancialId = @FinancialId) AS LineCount,
                    (SELECT COUNT(*) FROM app.FinancialDocument WHERE FinancialId = @FinancialId) AS DocumentCount
             FROM dbo.ufn_Financial_Row(@FinancialId) AS f
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT * FROM dbo.ufn_Financial_Row(@FinancialId);
END;
GO
