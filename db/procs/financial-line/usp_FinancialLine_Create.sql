-- usp_FinancialLine_Create - add a budget line to a financial (ADR-0029), at the end of its
-- section, with its typed amounts (usp_FinancialLine_SetAmounts).
-- Access: Manager with 'financials:create' on the financial's project (usp_Financial_AssertAccess).
-- Validation (50004): section operating / capital / other; description 1-255; category and
--   funding source at most 150; supplier 255; G/L 100; comments 1000; the tax profile, when set,
--   is a live profile of THIS financial; at most 300 live lines per financial, counted under an
--   update lock on the financial row, which also pins the horizon the amounts are checked against.
-- Audited in-transaction; returns dbo.ufn_FinancialLine_Row.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialLine_Create
    @FinancialId           INT,
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
    @ActorUserId           INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:create';

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

    IF (SELECT COUNT(*) FROM app.FinancialLine WHERE FinancialId = @FinancialId AND IsDeleted = 0) >= 300
        THROW 50004, N'VALIDATION:A financial can hold at most 300 lines', 1;
    IF @FinancialTaxProfileId IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.FinancialTaxProfile
                       WHERE FinancialTaxProfileId = @FinancialTaxProfileId
                         AND FinancialId = @FinancialId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:The tax profile does not belong to this financial', 1;

    INSERT INTO app.FinancialLine (FinancialId, [Section], [Description], CostCategory, FundingSource,
                                   Supplier, GlAccount, FinancialTaxProfileId, IsRecurrent, Comments,
                                   SortOrder, CreatedBy)
    VALUES (@FinancialId, @Section, @Description, @CostCategory, @FundingSource,
            @Supplier, @GlAccount, @FinancialTaxProfileId, ISNULL(@IsRecurrent, 0), @Comments,
            ISNULL((SELECT MAX(SortOrder) FROM app.FinancialLine
                    WHERE FinancialId = @FinancialId AND [Section] = @Section AND IsDeleted = 0), 0) + 1,
            @ActorUserId);
    DECLARE @Id INT = SCOPE_IDENTITY();

    EXEC dbo.usp_FinancialLine_SetAmounts
         @FinancialLineId = @Id, @AmountsJson = @AmountsJson,
         @FirstFiscalYear = @First, @HorizonYears = @Horizon;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.FinancialLine', CAST(@Id AS NVARCHAR(64)),
            (SELECT * FROM dbo.ufn_FinancialLine_Row(@Id) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT * FROM dbo.ufn_FinancialLine_Row(@Id);
END;
GO
