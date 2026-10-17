-- usp_FinancialLine_Update - full-row update of a budget line and its typed amounts (ADR-0029),
-- RowVer concurrency (CONFLICT 50002, NOT_FOUND 50001). The financial is immutable: it comes
-- from the row. A section change moves the line to the end of its new section.
-- Access: Manager with 'financials:update' on the row's project (usp_Financial_AssertAccess).
-- Validation as usp_FinancialLine_Create; the amounts are checked against the horizon read
-- under an update lock on the financial row. Audited in-transaction; returns the row.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialLine_Update
    @FinancialLineId       INT,
    @Section               VARCHAR(20),
    @Description           NVARCHAR(500),
    @CostCategory          NVARCHAR(300)  = NULL,
    @FundingSource         NVARCHAR(300)  = NULL,
    @Supplier              NVARCHAR(500)  = NULL,
    @GlAccount             NVARCHAR(200)  = NULL,
    @FinancialTaxProfileId INT            = NULL,
    @IsRecurrent           BIT            = 0,
    @Comments              NVARCHAR(2000) = NULL,
    @AmountsJson           NVARCHAR(MAX)  = N'[]',
    @RowVer                BIGINT,
    @ActorUserId           INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @FinancialId INT, @CurrentSection VARCHAR(10);
    SELECT @FinancialId = FinancialId, @CurrentSection = [Section]
    FROM app.FinancialLine WHERE FinancialLineId = @FinancialLineId AND IsDeleted = 0;
    IF @FinancialId IS NULL
        THROW 50001, N'NOT_FOUND:Budget line not found', 1;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:update';

    SET @Description   = LTRIM(RTRIM(@Description));
    SET @CostCategory  = NULLIF(LTRIM(RTRIM(@CostCategory)), N'');
    SET @FundingSource = NULLIF(LTRIM(RTRIM(@FundingSource)), N'');
    SET @Supplier      = NULLIF(LTRIM(RTRIM(@Supplier)), N'');
    SET @GlAccount     = NULLIF(LTRIM(RTRIM(@GlAccount)), N'');
    SET @Comments      = NULLIF(LTRIM(RTRIM(@Comments)), N'');
    IF ISNULL(@Section, '') NOT IN ('operating', 'capital', 'other')
        THROW 50004, N'VALIDATION:Section must be operating, capital or other', 1;
    IF @Description IS NULL OR LEN(@Description) NOT BETWEEN 1 AND 255
        THROW 50004, N'VALIDATION:A description of 1 to 255 characters is required', 1;
    IF LEN(@CostCategory) > 150 OR LEN(@FundingSource) > 150 OR LEN(@Supplier) > 255
       OR LEN(@GlAccount) > 100 OR LEN(@Comments) > 1000
        THROW 50004, N'VALIDATION:A field is too long', 1;

    BEGIN TRAN;

    DECLARE @First SMALLINT, @Horizon TINYINT;
    SELECT @First = FirstFiscalYear, @Horizon = HorizonYears
    FROM app.Financial WITH (UPDLOCK, HOLDLOCK)
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;
    IF @First IS NULL
        THROW 50001, N'NOT_FOUND:Financial not found', 1;

    IF @FinancialTaxProfileId IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.FinancialTaxProfile
                       WHERE FinancialTaxProfileId = @FinancialTaxProfileId
                         AND FinancialId = @FinancialId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:The tax profile does not belong to this financial', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT * FROM dbo.ufn_FinancialLine_Row(@FinancialLineId) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.FinancialLine SET
        [Section]             = @Section,
        [Description]         = @Description,
        CostCategory          = @CostCategory,
        FundingSource         = @FundingSource,
        Supplier              = @Supplier,
        GlAccount             = @GlAccount,
        FinancialTaxProfileId = @FinancialTaxProfileId,
        IsRecurrent           = ISNULL(@IsRecurrent, 0),
        Comments              = @Comments,
        SortOrder             = CASE WHEN @Section = @CurrentSection THEN SortOrder
                                     ELSE ISNULL((SELECT MAX(o.SortOrder) FROM app.FinancialLine AS o
                                                  WHERE o.FinancialId = @FinancialId AND o.[Section] = @Section
                                                    AND o.IsDeleted = 0), 0) + 1 END,
        UpdatedAtUtc          = SYSUTCDATETIME(),
        UpdatedBy             = @ActorUserId
    WHERE FinancialLineId = @FinancialLineId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.FinancialLine WHERE FinancialLineId = @FinancialLineId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Budget line not found', 1;
        THROW 50002, N'CONFLICT:The budget line was changed by someone else', 1;
    END;

    EXEC dbo.usp_FinancialLine_SetAmounts
         @FinancialLineId = @FinancialLineId, @AmountsJson = @AmountsJson,
         @FirstFiscalYear = @First, @HorizonYears = @Horizon;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.FinancialLine', CAST(@FinancialLineId AS NVARCHAR(64)), @Before,
            (SELECT * FROM dbo.ufn_FinancialLine_Row(@FinancialLineId) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT * FROM dbo.ufn_FinancialLine_Row(@FinancialLineId);
END;
GO
