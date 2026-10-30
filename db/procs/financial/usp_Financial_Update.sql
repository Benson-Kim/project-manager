-- usp_Financial_Update - the breakdown (PPTX slide 2) and calculator settings of one financial
-- (ADR-0029), full-row, with RowVer concurrency (CONFLICT 50002, NOT_FOUND 50001).
-- Access: Manager with 'financials:update' (usp_Financial_AssertAccess). The project is immutable.
-- Validation (50004): title 1-150; FirstFiscalYear 2000-2100; HorizonYears 1-7;
--   FiscalYearStartMonth 1-12; rates 0-1; Budget and RecurrentFees 0-999,999,999.99 or NULL;
--   label lists per usp_Financial_AssertLabelList; and, under a lock on the row, no typed amount
--   or live transaction may fall outside the new horizon (move or remove them first).
--   Changing the start month never re-dates stored transactions.
-- @BudgetIncludesTax: whether Budget is tax included (1, default) or before tax (0).
-- @CurrencyCode: the currency figures are shown in, or N'' for no symbol (ADR-0051). Upper-cased
--   here and checked by shape only, never against a currency list: the list is the runtime's ICU
--   data and moves. CK_Financial_CurrencyCode is the second gate behind this one and zod.
--   Declared wider than the three characters it accepts, as @Title is: a parameter sized to the
--   value truncates an oversized code at binding, before any check here can see it, so N'EURO'
--   would arrive as a valid N'EUR' and store as a different real currency. Wide, then refused.
-- Audited in-transaction; returns dbo.ufn_Financial_Row.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Financial_Update
    @FinancialId          INT,
    @Title                NVARCHAR(300),
    @ProjectNumber        INT            = NULL,
    @Acquisition          NVARCHAR(255)  = NULL,
    @GlGrandLivre         NVARCHAR(255)  = NULL,
    @BudgetEnvelope       NVARCHAR(255)  = NULL,
    @Budget               DECIMAL(19,2)  = NULL,
    @BudgetIncludesTax    BIT            = 1,
    @SpendBy              NVARCHAR(255)  = NULL,
    @RecurrentFees        DECIMAL(19,2)  = NULL,
    @ContractTimeframe    NVARCHAR(255)  = NULL,
    @FirstFiscalYear      SMALLINT,
    @HorizonYears         TINYINT,
    @FiscalYearStartMonth TINYINT,
    @EscalationRate       DECIMAL(9,6),
    @FlagThresholdRate    DECIMAL(9,6),
    @CostCategories       NVARCHAR(MAX)  = N'[]',
    @FundingSources       NVARCHAR(MAX)  = N'[]',
    @CurrencyCode         NVARCHAR(20)   = N'',
    @RowVer               BIGINT,
    @ActorUserId          INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:update';

    SET @Title = LTRIM(RTRIM(@Title));
    IF @Title IS NULL OR LEN(@Title) NOT BETWEEN 1 AND 150
        THROW 50004, N'VALIDATION:A title of 1 to 150 characters is required', 1;
    IF ISNULL(@FirstFiscalYear, 0) NOT BETWEEN 2000 AND 2100
        THROW 50004, N'VALIDATION:The first fiscal year must be from 2000 to 2100', 1;
    IF ISNULL(@HorizonYears, 0) NOT BETWEEN 1 AND 7
        THROW 50004, N'VALIDATION:The horizon must be 1 to 7 years', 1;
    IF ISNULL(@FiscalYearStartMonth, 0) NOT BETWEEN 1 AND 12
        THROW 50004, N'VALIDATION:The fiscal year must start in a month from 1 to 12', 1;
    IF ISNULL(@EscalationRate, -1) NOT BETWEEN 0 AND 1 OR ISNULL(@FlagThresholdRate, -1) NOT BETWEEN 0 AND 1
        THROW 50004, N'VALIDATION:Rates must be 0 to 100 %', 1;
    IF @Budget NOT BETWEEN 0 AND 999999999.99 OR @RecurrentFees NOT BETWEEN 0 AND 999999999.99
        THROW 50004, N'VALIDATION:Amounts must be 0 to 999,999,999.99', 1;
    IF @ProjectNumber < 0
        THROW 50004, N'VALIDATION:The project number cannot be negative', 1;

    SET @CostCategories = ISNULL(@CostCategories, N'[]');
    SET @FundingSources = ISNULL(@FundingSources, N'[]');
    EXEC dbo.usp_Financial_AssertLabelList @Labels = @CostCategories, @What = N'Cost categories';
    EXEC dbo.usp_Financial_AssertLabelList @Labels = @FundingSources, @What = N'Funding sources';

    SET @CurrencyCode = UPPER(LTRIM(RTRIM(ISNULL(@CurrencyCode, N''))));
    IF @CurrencyCode <> N''
       AND @CurrencyCode COLLATE Latin1_General_BIN NOT LIKE N'[A-Z][A-Z][A-Z]'
        THROW 50004, N'VALIDATION:A currency must be a three-letter code, or no currency at all', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT * FROM dbo.ufn_Financial_Row(@FinancialId) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    DECLARE @CurrentVer BIGINT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.Financial WITH (UPDLOCK, HOLDLOCK)
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Financial not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:The financial was changed by someone else', 1;

    DECLARE @LastYear INT = @FirstFiscalYear + @HorizonYears - 1;
    IF EXISTS (SELECT 1 FROM app.FinancialLineAmount AS a
               JOIN app.FinancialLine AS l ON l.FinancialLineId = a.FinancialLineId
               WHERE l.FinancialId = @FinancialId AND l.IsDeleted = 0
                 AND a.FiscalYear NOT BETWEEN @FirstFiscalYear AND @LastYear)
        THROW 50004, N'VALIDATION:Some budget amounts fall outside the new years; clear them first', 1;
    IF EXISTS (SELECT 1 FROM app.FinancialTransaction AS t
               JOIN app.FinancialLine AS l ON l.FinancialLineId = t.FinancialLineId
               WHERE l.FinancialId = @FinancialId AND l.IsDeleted = 0 AND t.IsDeleted = 0
                 AND t.FiscalYear NOT BETWEEN @FirstFiscalYear AND @LastYear)
        THROW 50004, N'VALIDATION:Some transactions fall outside the new years; move them first', 1;

    UPDATE app.Financial SET
        Title                = @Title,
        ProjectNumber        = @ProjectNumber,
        Acquisition          = NULLIF(LTRIM(RTRIM(@Acquisition)), N''),
        GlGrandLivre         = NULLIF(LTRIM(RTRIM(@GlGrandLivre)), N''),
        BudgetEnvelope       = NULLIF(LTRIM(RTRIM(@BudgetEnvelope)), N''),
        Budget               = @Budget,
        BudgetIncludesTax    = ISNULL(@BudgetIncludesTax, 1),
        SpendBy              = NULLIF(LTRIM(RTRIM(@SpendBy)), N''),
        RecurrentFees        = @RecurrentFees,
        ContractTimeframe    = NULLIF(LTRIM(RTRIM(@ContractTimeframe)), N''),
        FirstFiscalYear      = @FirstFiscalYear,
        HorizonYears         = @HorizonYears,
        FiscalYearStartMonth = @FiscalYearStartMonth,
        EscalationRate       = @EscalationRate,
        FlagThresholdRate    = @FlagThresholdRate,
        CostCategories       = @CostCategories,
        FundingSources       = @FundingSources,
        CurrencyCode         = @CurrencyCode,
        UpdatedAtUtc         = SYSUTCDATETIME(),
        UpdatedBy            = @ActorUserId
    WHERE FinancialId = @FinancialId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Financial', CAST(@FinancialId AS NVARCHAR(64)), @Before,
            (SELECT * FROM dbo.ufn_Financial_Row(@FinancialId) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT * FROM dbo.ufn_Financial_Row(@FinancialId);
END;
GO
