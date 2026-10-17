-- usp_FinancialTransaction_Update - edit an invoice (ADR-0029), RowVer concurrency (CONFLICT
-- 50002, NOT_FOUND 50001). @FinancialLineId may move it to another live line of the SAME
-- financial only (VALIDATION 50004 otherwise). A new line or a new fiscal year re-captures the tax
-- rate (the line's profile for that year); otherwise the captured rate stays. Fiscal year and
-- field rules as in _Create, checked under an update lock on the financial row.
-- Access: Manager, or a per-person grant, on section 'financial-tax-invoices' (update) of the
-- row's project. Audited; returns the row.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialTransaction_Update
    @FinancialTransactionId INT,
    @FinancialLineId        INT,
    @TransactionDate        DATE,
    @FiscalYear             SMALLINT       = NULL,
    @Reference              NVARCHAR(200)  = NULL,
    @Description            NVARCHAR(500)  = NULL,
    @Amount                 DECIMAL(19,2),
    @RowVer                 BIGINT,
    @ActorUserId            INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @FinancialId INT, @CurrentLineId INT, @CurrentYear SMALLINT;
    SELECT @FinancialId = l.FinancialId, @CurrentLineId = t.FinancialLineId, @CurrentYear = t.FiscalYear
    FROM app.FinancialTransaction AS t
    JOIN app.FinancialLine AS l ON l.FinancialLineId = t.FinancialLineId
    WHERE t.FinancialTransactionId = @FinancialTransactionId AND t.IsDeleted = 0 AND l.IsDeleted = 0;
    IF @FinancialId IS NULL
        THROW 50001, N'NOT_FOUND:Transaction not found', 1;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financial-tax-invoices:update';

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

    IF @FinancialLineId IS NULL
       OR NOT EXISTS (SELECT 1 FROM app.FinancialLine
                      WHERE FinancialLineId = @FinancialLineId AND FinancialId = @FinancialId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:The budget line does not belong to this financial', 1;

    IF @FiscalYear IS NULL
        SET @FiscalYear = CASE WHEN MONTH(@TransactionDate) >= @StartMonth
                               THEN YEAR(@TransactionDate) ELSE YEAR(@TransactionDate) - 1 END;
    IF @FiscalYear NOT BETWEEN @First AND @First + @Horizon - 1
        THROW 50004, N'VALIDATION:The fiscal year falls outside the financial''s years', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT * FROM dbo.ufn_FinancialTransaction_Row(@FinancialTransactionId) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    DECLARE @NewRate DECIMAL(9,6) =
        ISNULL((SELECT r.Rate FROM app.FinancialLine AS l
                CROSS APPLY dbo.ufn_FinancialTaxProfile_RateFor(l.FinancialTaxProfileId, @FiscalYear) AS r
                WHERE l.FinancialLineId = @FinancialLineId), 0);

    UPDATE app.FinancialTransaction SET
        FinancialLineId = @FinancialLineId,
        FiscalYear      = @FiscalYear,
        TransactionDate = @TransactionDate,
        Reference       = @Reference,
        [Description]   = @Description,
        Amount          = @Amount,
        TaxRate         = CASE WHEN @FinancialLineId = @CurrentLineId AND @FiscalYear = @CurrentYear
                               THEN TaxRate ELSE @NewRate END,
        UpdatedAtUtc    = SYSUTCDATETIME(),
        UpdatedBy       = @ActorUserId
    WHERE FinancialTransactionId = @FinancialTransactionId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.FinancialTransaction WHERE FinancialTransactionId = @FinancialTransactionId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Transaction not found', 1;
        THROW 50002, N'CONFLICT:The transaction was changed by someone else', 1;
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.FinancialTransaction', CAST(@FinancialTransactionId AS NVARCHAR(64)), @Before,
            (SELECT * FROM dbo.ufn_FinancialTransaction_Row(@FinancialTransactionId) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT * FROM dbo.ufn_FinancialTransaction_Row(@FinancialTransactionId);
END;
GO
