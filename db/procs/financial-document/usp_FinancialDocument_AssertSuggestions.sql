-- usp_FinancialDocument_AssertSuggestions - checks a document's advisory suggestion rules
-- (ADR-0030) before they are stored or copied, so a bad list is a VALIDATION 50004, never a
-- constraint error. A JSON array of at most 2 objects, one per kind:
--   {"kind": "budgetBelow", "amount": "200000.00", "reason": "..."} - amount 0.01-999,999,999.99,
--     two decimals at most;
--   {"kind": "noCapital", "reason": "..."} - no amount;
--   reason 1-2000 characters.
-- @MaxPerDocument lets the template check pass every document's rules in one array.
-- The app validates the same shape with zod (src/modules/financials/schemas/documents.ts).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_AssertSuggestions
    @Suggestions    NVARCHAR(MAX),
    @MaxPerDocument INT = 2
AS
BEGIN
    SET NOCOUNT ON;

    IF @Suggestions IS NULL OR ISJSON(@Suggestions) <> 1 OR LEFT(LTRIM(@Suggestions), 1) <> N'['
        THROW 50004, N'VALIDATION:Suggestions must be a list', 1;
    IF @MaxPerDocument IS NOT NULL AND (SELECT COUNT(*) FROM OPENJSON(@Suggestions)) > @MaxPerDocument
        THROW 50004, N'VALIDATION:A document can hold at most one suggestion of each kind', 1;
    IF EXISTS (SELECT 1 FROM OPENJSON(@Suggestions) WHERE [type] <> 5)
        THROW 50004, N'VALIDATION:Each suggestion must be an object', 1;
    IF @MaxPerDocument IS NOT NULL
       AND EXISTS (SELECT JSON_VALUE([value], N'$.kind') FROM OPENJSON(@Suggestions)
                   GROUP BY JSON_VALUE([value], N'$.kind') HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:A document can hold at most one suggestion of each kind', 1;

    IF EXISTS (
        SELECT 1
        FROM OPENJSON(@Suggestions) AS s
        CROSS APPLY OPENJSON(s.[value]) WITH (
            Kind   NVARCHAR(4000) N'$.kind',
            Amount NVARCHAR(4000) N'$.amount',
            Reason NVARCHAR(4000) N'$.reason'
        ) AS v
        WHERE ISNULL(v.Kind, N'') NOT IN (N'budgetBelow', N'noCapital')
           OR ISNULL(LEN(LTRIM(RTRIM(v.Reason))), 0) NOT BETWEEN 1 AND 2000
           OR (v.Kind = N'noCapital' AND v.Amount IS NOT NULL)
           OR (v.Kind = N'budgetBelow'
               AND (TRY_CAST(v.Amount AS DECIMAL(38,10)) IS NULL
                    OR TRY_CAST(v.Amount AS DECIMAL(38,10)) NOT BETWEEN 0.01 AND 999999999.99
                    OR TRY_CAST(v.Amount AS DECIMAL(38,10)) <> ROUND(TRY_CAST(v.Amount AS DECIMAL(38,10)), 2)))
    )
        THROW 50004, N'VALIDATION:A suggestion is incomplete or out of range', 1;
END;
GO
