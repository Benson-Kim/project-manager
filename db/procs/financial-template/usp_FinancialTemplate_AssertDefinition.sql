-- usp_FinancialTemplate_AssertDefinition - checks a template document (ADR-0029) before it is
-- stored or copied, so a bad document is a VALIDATION 50004, never a constraint error:
--   horizonYears 1-7, fiscalYearStartMonth 1-12, escalationRate and flagThresholdRate 0-1;
--   taxProfiles: at most 20, key 1-20 characters and unique, name 1-100 and unique, rate 0-1;
--   costCategories / fundingSources: usp_Financial_AssertLabelList;
--   lines: at most 300, section operating / capital / other, description 1-255, category and
--   source at most 150, taxProfileKey null or a listed key, isRecurrent true/false/absent,
--   amount null or 0-999,999,999.99 with at most two decimals;
--   documents (ADR-0030; optional, older templates have none): at most 50, name 1-200 and unique,
--   required true / false / null, reason null or at most 2000, suggestions per
--   usp_FinancialDocument_AssertSuggestions (at most one of each kind per document).
-- The app validates the same shape with zod (src/modules/financials/schemas/template.ts).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialTemplate_AssertDefinition
    @Definition NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @Definition IS NULL OR ISJSON(@Definition) <> 1 OR LEFT(LTRIM(@Definition), 1) <> N'{'
        THROW 50004, N'VALIDATION:The template must be a JSON object', 1;
    IF LEN(@Definition) > 200000
        THROW 50004, N'VALIDATION:The template is too large', 1;

    IF ISNULL(TRY_CAST(JSON_VALUE(@Definition, N'$.horizonYears') AS INT), 0) NOT BETWEEN 1 AND 7
        THROW 50004, N'VALIDATION:The horizon must be 1 to 7 years', 1;
    IF ISNULL(TRY_CAST(JSON_VALUE(@Definition, N'$.fiscalYearStartMonth') AS INT), 0) NOT BETWEEN 1 AND 12
        THROW 50004, N'VALIDATION:The fiscal year must start in a month from 1 to 12', 1;
    IF ISNULL(TRY_CAST(JSON_VALUE(@Definition, N'$.escalationRate') AS DECIMAL(9,6)), -1) NOT BETWEEN 0 AND 1
        THROW 50004, N'VALIDATION:The escalation rate must be 0 to 100 %', 1;
    IF ISNULL(TRY_CAST(JSON_VALUE(@Definition, N'$.flagThresholdRate') AS DECIMAL(9,6)), -1) NOT BETWEEN 0 AND 1
        THROW 50004, N'VALIDATION:The flag threshold must be 0 to 100 %', 1;

    IF JSON_QUERY(@Definition, N'$.taxProfiles') IS NULL OR LEFT(JSON_QUERY(@Definition, N'$.taxProfiles'), 1) <> N'['
        THROW 50004, N'VALIDATION:Tax profiles must be a list', 1;

    DECLARE @Profiles TABLE ([Key] NVARCHAR(4000), [Name] NVARCHAR(4000), Rate DECIMAL(9,6));
    INSERT INTO @Profiles ([Key], [Name], Rate)
    SELECT LTRIM(RTRIM(JSON_VALUE(p.[value], N'$.key'))),
           LTRIM(RTRIM(JSON_VALUE(p.[value], N'$.name'))),
           TRY_CAST(JSON_VALUE(p.[value], N'$.rate') AS DECIMAL(9,6))
    FROM OPENJSON(@Definition, N'$.taxProfiles') AS p;

    IF (SELECT COUNT(*) FROM @Profiles) > 20
        THROW 50004, N'VALIDATION:A template can hold at most 20 tax profiles', 1;
    IF EXISTS (SELECT 1 FROM @Profiles
               WHERE ISNULL(LEN([Key]), 0) NOT BETWEEN 1 AND 20
                  OR ISNULL(LEN([Name]), 0) NOT BETWEEN 1 AND 100
                  OR Rate IS NULL OR Rate NOT BETWEEN 0 AND 1)
        THROW 50004, N'VALIDATION:Each tax profile needs a name of 1 to 100 characters and a rate of 0 to 100 %', 1;
    IF EXISTS (SELECT [Key] FROM @Profiles GROUP BY [Key] HAVING COUNT(*) > 1)
       OR EXISTS (SELECT [Name] FROM @Profiles GROUP BY [Name] HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:Tax profile names must be unique', 1;

    DECLARE @Categories NVARCHAR(MAX) = JSON_QUERY(@Definition, N'$.costCategories');
    DECLARE @Sources NVARCHAR(MAX) = JSON_QUERY(@Definition, N'$.fundingSources');
    EXEC dbo.usp_Financial_AssertLabelList @Labels = @Categories, @What = N'Cost categories';
    EXEC dbo.usp_Financial_AssertLabelList @Labels = @Sources, @What = N'Funding sources';

    IF JSON_QUERY(@Definition, N'$.lines') IS NULL OR LEFT(JSON_QUERY(@Definition, N'$.lines'), 1) <> N'['
        THROW 50004, N'VALIDATION:Standard lines must be a list', 1;
    IF (SELECT COUNT(*) FROM OPENJSON(@Definition, N'$.lines')) > 300
        THROW 50004, N'VALIDATION:A template can hold at most 300 lines', 1;

    IF EXISTS (
        SELECT 1
        FROM OPENJSON(@Definition, N'$.lines') AS l
        CROSS APPLY OPENJSON(l.[value]) WITH (
            [Section]     NVARCHAR(4000) N'$.section',
            [Description] NVARCHAR(4000) N'$.description',
            CostCategory  NVARCHAR(4000) N'$.costCategory',
            FundingSource NVARCHAR(4000) N'$.fundingSource',
            TaxProfileKey NVARCHAR(4000) N'$.taxProfileKey',
            Amount        NVARCHAR(4000) N'$.amount'
        ) AS v
        WHERE ISNULL(v.[Section], N'') NOT IN (N'operating', N'capital', N'other')
           OR ISNULL(LEN(LTRIM(RTRIM(v.[Description]))), 0) NOT BETWEEN 1 AND 255
           OR LEN(v.CostCategory) > 150
           OR LEN(v.FundingSource) > 150
           OR (v.TaxProfileKey IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM @Profiles AS p WHERE p.[Key] = LTRIM(RTRIM(v.TaxProfileKey))))
           OR (v.Amount IS NOT NULL
               AND (TRY_CAST(v.Amount AS DECIMAL(38,10)) IS NULL
                    OR TRY_CAST(v.Amount AS DECIMAL(38,10)) NOT BETWEEN 0 AND 999999999.99
                    OR TRY_CAST(v.Amount AS DECIMAL(38,10)) <> ROUND(TRY_CAST(v.Amount AS DECIMAL(38,10)), 2)))
           OR ISNULL(JSON_VALUE(l.[value], N'$.isRecurrent'), N'false') NOT IN (N'true', N'false')
    )
        THROW 50004, N'VALIDATION:A standard line is incomplete or out of range', 1;

    IF JSON_QUERY(@Definition, N'$.documents') IS NOT NULL
       OR JSON_VALUE(@Definition, N'$.documents') IS NOT NULL
    BEGIN
        IF LEFT(ISNULL(JSON_QUERY(@Definition, N'$.documents'), N''), 1) <> N'['
            THROW 50004, N'VALIDATION:Documents must be a list', 1;
        IF (SELECT COUNT(*) FROM OPENJSON(@Definition, N'$.documents')) > 50
            THROW 50004, N'VALIDATION:A template can hold at most 50 documents', 1;
        IF EXISTS (SELECT 1 FROM OPENJSON(@Definition, N'$.documents') WHERE [type] <> 5)
            THROW 50004, N'VALIDATION:A document is incomplete or out of range', 1;

        DECLARE @Docs TABLE ([Name] NVARCHAR(4000), [Required] NVARCHAR(4000), RequiredType INT,
                             Reason NVARCHAR(MAX), ReasonType INT, Suggestions NVARCHAR(MAX), SuggestionsType INT);
        INSERT INTO @Docs ([Name], [Required], RequiredType, Reason, ReasonType, Suggestions, SuggestionsType)
        SELECT LTRIM(RTRIM(JSON_VALUE(d.[value], N'$.name'))),
               (SELECT r.[value] FROM OPENJSON(d.[value]) AS r WHERE r.[key] = N'required'),
               (SELECT r.[type] FROM OPENJSON(d.[value]) AS r WHERE r.[key] = N'required'),
               (SELECT r.[value] FROM OPENJSON(d.[value]) AS r WHERE r.[key] = N'reason' AND r.[type] = 1),
               (SELECT r.[type] FROM OPENJSON(d.[value]) AS r WHERE r.[key] = N'reason'),
               JSON_QUERY(d.[value], N'$.suggestions'),
               (SELECT r.[type] FROM OPENJSON(d.[value]) AS r WHERE r.[key] = N'suggestions')
        FROM OPENJSON(@Definition, N'$.documents') AS d;

        IF EXISTS (SELECT 1 FROM @Docs
                   WHERE ISNULL(LEN([Name]), 0) NOT BETWEEN 1 AND 200
                      OR ISNULL(RequiredType, 0) NOT IN (0, 3)
                      OR ISNULL(ReasonType, 0) NOT IN (0, 1)
                      OR LEN(LTRIM(RTRIM(Reason))) > 2000
                      OR ISNULL(SuggestionsType, 4) <> 4)
            THROW 50004, N'VALIDATION:A document is incomplete or out of range', 1;
        IF EXISTS (SELECT [Name] FROM @Docs GROUP BY [Name] HAVING COUNT(*) > 1)
            THROW 50004, N'VALIDATION:Document names must be unique', 1;
        IF EXISTS (SELECT 1 FROM @Docs AS d
                   CROSS APPLY OPENJSON(ISNULL(d.Suggestions, N'[]')) AS s WHERE s.[type] <> 5)
            THROW 50004, N'VALIDATION:A suggestion is incomplete or out of range', 1;
        IF EXISTS (SELECT 1 FROM @Docs WHERE (SELECT COUNT(*) FROM OPENJSON(ISNULL(Suggestions, N'[]'))) > 2)
           OR EXISTS (SELECT 1 FROM @Docs AS d
                      CROSS APPLY (SELECT JSON_VALUE(s.[value], N'$.kind') AS Kind
                                   FROM OPENJSON(ISNULL(d.Suggestions, N'[]')) AS s) AS k
                      GROUP BY d.[Name], k.Kind HAVING COUNT(*) > 1)
            THROW 50004, N'VALIDATION:A document can hold at most one suggestion of each kind', 1;

        DECLARE @AllSuggestions NVARCHAR(MAX) =
            N'[' + ISNULL((SELECT STRING_AGG(CAST(s.[value] AS NVARCHAR(MAX)), N',')
                           FROM @Docs AS d
                           CROSS APPLY OPENJSON(ISNULL(d.Suggestions, N'[]')) AS s), N'') + N']';
        EXEC dbo.usp_FinancialDocument_AssertSuggestions @Suggestions = @AllSuggestions, @MaxPerDocument = NULL;
    END;
END;
GO
