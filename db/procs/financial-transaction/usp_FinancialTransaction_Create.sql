-- usp_FinancialTransaction_Create - record an invoice (or a credit note, negative) against a
-- live budget line (ADR-0029). The user enters the pre-tax amount; the tax rate is captured
-- here from the line's tax profile for the transaction's fiscal year (its rate steps included; 0
-- without a profile) and never taken from the caller, so a later rate change never restates
-- what was spent.
-- @FiscalYear NULL = the fiscal year of @TransactionDate under the financial's start month; it
-- must fall inside the horizon. Amount non-zero, |amount| <= 999,999,999.99; reference at most
-- 100, description 255 (VALIDATION 50004). At most 5000 live transactions per financial, counted
-- under an update lock on the financial row.
-- Access: Manager, or a per-person grant, on section 'financial-tax-invoices' (create) of the
-- line's project. Audited; returns the row.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialTransaction_Create
    @FinancialLineId INT,
    @TransactionDate DATE,
    @FiscalYear      SMALLINT       = NULL,
    @Reference       NVARCHAR(200)  = NULL,
    @Description     NVARCHAR(500)  = NULL,
    @Amount          DECIMAL(19,2),
    @ActorUserId     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @FinancialId INT;
    SELECT @FinancialId = FinancialId FROM app.FinancialLine
    WHERE FinancialLineId = @FinancialLineId AND IsDeleted = 0;
    IF @FinancialId IS NULL
        THROW 50001, N'NOT_FOUND:Budget line not found', 1;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financial-tax-invoices:create';

    SET @Reference   = NULLIF(LTRIM(RTRIM(@Reference)), N'');
    SET @Description = NULLIF(LTRIM(RTRIM(@Description)), N'');
    IF @TransactionDate IS NULL
        THROW 50004, N'VALIDATION:A date is required', 1;
    IF @Amount IS NULL OR @Amount = 0 OR ABS(@Amount) > 999999999.99
        THROW 50004, N'VALIDATION:The amount must be non-zero and at most 999,999,999.99', 1;
    IF LEN(@Reference) > 100 OR LEN(@Description) > 255
        THROW 50004, N'VALIDATION:A field is too long', 1;

    BEGIN TRAN;

    DECLARE @First SMALLINT, @Horizon TINYINT, @StartMonth TINYINT;
    SELECT @First = FirstFiscalYear, @Horizon = HorizonYears, @StartMonth = FiscalYearStartMonth
    FROM app.Financial WITH (UPDLOCK, HOLDLOCK)
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;
    IF @First IS NULL
        THROW 50001, N'NOT_FOUND:Financial not found', 1;

    IF @FiscalYear IS NULL
        SET @FiscalYear = CASE WHEN MONTH(@TransactionDate) >= @StartMonth
                               THEN YEAR(@TransactionDate) ELSE YEAR(@TransactionDate) - 1 END;
    IF @FiscalYear NOT BETWEEN @First AND @First + @Horizon - 1
        THROW 50004, N'VALIDATION:The fiscal year falls outside the financial''s years', 1;

    IF (SELECT COUNT(*) FROM app.FinancialTransaction AS t
        JOIN app.FinancialLine AS l ON l.FinancialLineId = t.FinancialLineId
        WHERE l.FinancialId = @FinancialId AND t.IsDeleted = 0) >= 5000
        THROW 50004, N'VALIDATION:A financial can hold at most 5000 transactions', 1;

    DECLARE @TaxRate DECIMAL(9,6) =
        ISNULL((SELECT r.Rate FROM app.FinancialLine AS l
                CROSS APPLY dbo.ufn_FinancialTaxProfile_RateFor(l.FinancialTaxProfileId, @FiscalYear) AS r
                WHERE l.FinancialLineId = @FinancialLineId), 0);

    INSERT INTO app.FinancialTransaction (FinancialLineId, FiscalYear, TransactionDate, Reference,
                                          [Description], Amount, TaxRate, CreatedBy)
    VALUES (@FinancialLineId, @FiscalYear, @TransactionDate, @Reference,
            @Description, @Amount, @TaxRate, @ActorUserId);
    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.FinancialTransaction', CAST(@Id AS NVARCHAR(64)),
            (SELECT * FROM dbo.ufn_FinancialTransaction_Row(@Id) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT * FROM dbo.ufn_FinancialTransaction_Row(@Id);
END;
GO
