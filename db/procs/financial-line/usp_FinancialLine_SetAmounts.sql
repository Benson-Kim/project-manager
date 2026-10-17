-- usp_FinancialLine_SetAmounts - replaces a line's typed pre-tax amounts (ADR-0029):
-- @AmountsJson = [{"fiscalYear": 2023, "amount": "350.00"}]. Each year at most once and inside
-- the financial's horizon; amounts 0-999,999,999.99 with at most two decimals (VALIDATION 50004).
-- Called only inside usp_FinancialLine_Create / _Update's transaction, after their access check
-- and with the horizon they read under the financial's lock.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialLine_SetAmounts
    @FinancialLineId INT,
    @AmountsJson     NVARCHAR(MAX),
    @FirstFiscalYear SMALLINT,
    @HorizonYears    TINYINT
AS
BEGIN
    SET NOCOUNT ON;

    SET @AmountsJson = ISNULL(@AmountsJson, N'[]');
    IF ISJSON(@AmountsJson) <> 1 OR LEFT(LTRIM(@AmountsJson), 1) <> N'['
        THROW 50004, N'VALIDATION:Amounts must be a list', 1;

    DECLARE @Amounts TABLE (FiscalYear INT NULL, Amount DECIMAL(38,10) NULL);
    INSERT INTO @Amounts (FiscalYear, Amount)
    SELECT TRY_CAST(JSON_VALUE(a.[value], N'$.fiscalYear') AS INT),
           TRY_CAST(JSON_VALUE(a.[value], N'$.amount') AS DECIMAL(38,10))
    FROM OPENJSON(@AmountsJson) AS a;

    IF EXISTS (SELECT 1 FROM @Amounts
               WHERE FiscalYear IS NULL OR Amount IS NULL
                  OR Amount NOT BETWEEN 0 AND 999999999.99 OR Amount <> ROUND(Amount, 2))
        THROW 50004, N'VALIDATION:Amounts must be 0 to 999,999,999.99 with at most two decimals', 1;
    IF EXISTS (SELECT FiscalYear FROM @Amounts GROUP BY FiscalYear HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:A year can hold one amount only', 1;
    IF EXISTS (SELECT 1 FROM @Amounts
               WHERE FiscalYear NOT BETWEEN @FirstFiscalYear AND @FirstFiscalYear + @HorizonYears - 1)
        THROW 50004, N'VALIDATION:An amount falls outside the financial''s years', 1;

    DELETE FROM app.FinancialLineAmount WHERE FinancialLineId = @FinancialLineId;
    INSERT INTO app.FinancialLineAmount (FinancialLineId, FiscalYear, Amount)
    SELECT @FinancialLineId, FiscalYear, CAST(Amount AS DECIMAL(19,2)) FROM @Amounts;
END;
GO
