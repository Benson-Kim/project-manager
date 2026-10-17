-- usp_FinancialTaxProfile_Set - replace a financial's tax profiles (ADR-0029), the whole list in
-- display order:
--   @ProfilesJson = [{"id": 12 | null, "name": "...", "rate": "0.056879",
--                     "steps": [{"fromFiscalYear": 2027, "rate": "0.060000"}]}]
-- An id keeps (and renames / re-rates) that profile; null adds one; a live profile left out is
-- removed, unless a live line still uses it (VALIDATION 50004). Ids must be this financial's live
-- profiles (VALIDATION otherwise: never another financial's). At most 20 profiles; names 1-100 and
-- unique; rates 0-1. Steps (amendment 2026-10-16): at most 10 per profile, one per fiscal year
-- (2000-2100), rate 0-1; a year before the first step takes the profile's rate. Steps re-price the
-- budget for those years only; transactions keep the rate captured on them.
-- The financial's RowVer is the list's token (CONFLICT 50002) and is bumped by the save.
-- Access: Manager, or a per-person grant, on section 'financial-tax-invoices' (update) — kept apart
-- from 'financials' so editing budget lines never includes changing tax rates.
-- Audited in-transaction (before/after list). Returns dbo.ufn_Financial_Row.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialTaxProfile_Set
    @FinancialId  INT,
    @ProfilesJson NVARCHAR(MAX),
    @RowVer       BIGINT,
    @ActorUserId  INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financial-tax-invoices:update';

    IF @ProfilesJson IS NULL OR ISJSON(@ProfilesJson) <> 1 OR LEFT(LTRIM(@ProfilesJson), 1) <> N'['
        THROW 50004, N'VALIDATION:Tax profiles must be a list', 1;

    DECLARE @Wanted TABLE (Ordinal INT PRIMARY KEY, Id INT NULL, [Name] NVARCHAR(4000), Rate DECIMAL(9,6), RawId NVARCHAR(4000));
    INSERT INTO @Wanted (Ordinal, Id, [Name], Rate, RawId)
    SELECT CAST(p.[key] AS INT) + 1,
           TRY_CAST(JSON_VALUE(p.[value], N'$.id') AS INT),
           LTRIM(RTRIM(JSON_VALUE(p.[value], N'$.name'))),
           TRY_CAST(JSON_VALUE(p.[value], N'$.rate') AS DECIMAL(9,6)),
           JSON_VALUE(p.[value], N'$.id')
    FROM OPENJSON(@ProfilesJson) AS p;

    DECLARE @Steps TABLE (Ordinal INT, FromFiscalYear INT NULL, Rate DECIMAL(9,6) NULL);
    INSERT INTO @Steps (Ordinal, FromFiscalYear, Rate)
    SELECT CAST(p.[key] AS INT) + 1,
           TRY_CAST(JSON_VALUE(s.[value], N'$.fromFiscalYear') AS INT),
           TRY_CAST(JSON_VALUE(s.[value], N'$.rate') AS DECIMAL(9,6))
    FROM OPENJSON(@ProfilesJson) AS p
    CROSS APPLY OPENJSON(p.[value], N'$.steps') AS s;

    IF (SELECT COUNT(*) FROM @Wanted) > 20
        THROW 50004, N'VALIDATION:A financial can hold at most 20 tax profiles', 1;
    IF EXISTS (SELECT 1 FROM @Wanted
               WHERE ISNULL(LEN([Name]), 0) NOT BETWEEN 1 AND 100
                  OR Rate IS NULL OR Rate NOT BETWEEN 0 AND 1
                  OR (RawId IS NOT NULL AND Id IS NULL))
        THROW 50004, N'VALIDATION:Each tax profile needs a name of 1 to 100 characters and a rate of 0 to 100 %', 1;
    IF EXISTS (SELECT [Name] FROM @Wanted GROUP BY [Name] HAVING COUNT(*) > 1)
       OR EXISTS (SELECT Id FROM @Wanted WHERE Id IS NOT NULL GROUP BY Id HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:Tax profile names must be unique', 1;
    IF EXISTS (SELECT 1 FROM @Steps
               WHERE FromFiscalYear IS NULL OR FromFiscalYear NOT BETWEEN 2000 AND 2100
                  OR Rate IS NULL OR Rate NOT BETWEEN 0 AND 1)
       OR EXISTS (SELECT Ordinal, FromFiscalYear FROM @Steps GROUP BY Ordinal, FromFiscalYear HAVING COUNT(*) > 1)
       OR EXISTS (SELECT Ordinal FROM @Steps GROUP BY Ordinal HAVING COUNT(*) > 10)
        THROW 50004, N'VALIDATION:Each rate change needs its own fiscal year and a rate of 0 to 100 %', 1;

    BEGIN TRAN;

    UPDATE app.Financial SET UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE FinancialId = @FinancialId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Financial WHERE FinancialId = @FinancialId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Financial not found', 1;
        THROW 50002, N'CONFLICT:The financial was changed by someone else', 1;
    END;

    IF EXISTS (SELECT 1 FROM @Wanted AS w
               WHERE w.Id IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM app.FinancialTaxProfile AS p
                                 WHERE p.FinancialTaxProfileId = w.Id
                                   AND p.FinancialId = @FinancialId AND p.IsDeleted = 0))
        THROW 50004, N'VALIDATION:A tax profile does not belong to this financial', 1;

    IF EXISTS (SELECT 1 FROM app.FinancialLine AS l
               JOIN app.FinancialTaxProfile AS p ON p.FinancialTaxProfileId = l.FinancialTaxProfileId
               WHERE l.FinancialId = @FinancialId AND l.IsDeleted = 0 AND p.IsDeleted = 0
                 AND NOT EXISTS (SELECT 1 FROM @Wanted AS w WHERE w.Id = p.FinancialTaxProfileId))
        THROW 50004, N'VALIDATION:A tax profile still used by a budget line cannot be removed', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT p.FinancialTaxProfileId, p.[Name], p.Rate, p.SortOrder,
                (SELECT r.FromFiscalYear, r.Rate FROM app.FinancialTaxProfileRate AS r
                 WHERE r.FinancialTaxProfileId = p.FinancialTaxProfileId ORDER BY r.FromFiscalYear FOR JSON PATH) AS Steps
         FROM app.FinancialTaxProfile AS p
         WHERE p.FinancialId = @FinancialId AND p.IsDeleted = 0 ORDER BY p.SortOrder FOR JSON PATH);

    UPDATE app.FinancialTaxProfile SET
        IsDeleted = 1, DeletedAtUtc = SYSUTCDATETIME(), DeletedBy = @ActorUserId
    WHERE FinancialId = @FinancialId AND IsDeleted = 0
      AND FinancialTaxProfileId NOT IN (SELECT Id FROM @Wanted WHERE Id IS NOT NULL);

    UPDATE p SET
        [Name] = w.[Name], Rate = w.Rate, SortOrder = w.Ordinal,
        UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    FROM app.FinancialTaxProfile AS p
    JOIN @Wanted AS w ON w.Id = p.FinancialTaxProfileId
    WHERE p.FinancialId = @FinancialId AND p.IsDeleted = 0
      AND (p.[Name] <> w.[Name] OR p.Rate <> w.Rate OR p.SortOrder <> w.Ordinal);

    DECLARE @Ids TABLE (Ordinal INT PRIMARY KEY, Id INT);
    INSERT INTO @Ids (Ordinal, Id) SELECT Ordinal, Id FROM @Wanted WHERE Id IS NOT NULL;
    MERGE app.FinancialTaxProfile AS t
    USING (SELECT Ordinal, [Name], Rate FROM @Wanted WHERE Id IS NULL) AS s ON 1 = 0
    WHEN NOT MATCHED THEN
        INSERT (FinancialId, [Name], Rate, SortOrder, CreatedBy)
        VALUES (@FinancialId, s.[Name], s.Rate, s.Ordinal, @ActorUserId)
    OUTPUT s.Ordinal, inserted.FinancialTaxProfileId INTO @Ids;

    DELETE r FROM app.FinancialTaxProfileRate AS r
    JOIN @Ids AS i ON i.Id = r.FinancialTaxProfileId;
    INSERT INTO app.FinancialTaxProfileRate (FinancialTaxProfileId, FromFiscalYear, Rate)
    SELECT i.Id, s.FromFiscalYear, s.Rate FROM @Steps AS s JOIN @Ids AS i ON i.Ordinal = s.Ordinal;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'SetTaxProfiles', N'app.Financial', CAST(@FinancialId AS NVARCHAR(64)), @Before,
            (SELECT p.FinancialTaxProfileId, p.[Name], p.Rate, p.SortOrder,
                    (SELECT r.FromFiscalYear, r.Rate FROM app.FinancialTaxProfileRate AS r
                     WHERE r.FinancialTaxProfileId = p.FinancialTaxProfileId ORDER BY r.FromFiscalYear FOR JSON PATH) AS Steps
             FROM app.FinancialTaxProfile AS p
             WHERE p.FinancialId = @FinancialId AND p.IsDeleted = 0 ORDER BY p.SortOrder FOR JSON PATH));

    COMMIT;

    SELECT * FROM dbo.ufn_Financial_Row(@FinancialId);
END;
GO
