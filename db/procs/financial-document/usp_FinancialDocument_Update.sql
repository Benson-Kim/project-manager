-- usp_FinancialDocument_Update - one checklist row of a financial (ADR-0030): name, required
-- (NULL = not decided), reason for not creating it and its suggestion rules, full-row, with RowVer
-- concurrency (CONFLICT 50002, NOT_FOUND 50001).
-- Access: Manager with 'financials:update' on the financial's project
-- (usp_FinancialDocument_AssertAccess). Validation as usp_FinancialDocument_Create; another live
-- document of the same name is DUPLICATE 50005. The reason is never required.
-- Audited in-transaction; returns dbo.ufn_FinancialDocument_Row.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_Update
    @FinancialDocumentId INT,
    @Name                NVARCHAR(400),
    @IsRequired          BIT           = NULL,
    @ReasonNotCreated    NVARCHAR(MAX) = NULL,
    @Suggestions         NVARCHAR(MAX) = N'[]',
    @RowVer              BIGINT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @FinancialId INT;
    EXEC dbo.usp_FinancialDocument_AssertAccess
         @FinancialDocumentId = @FinancialDocumentId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:update', @FinancialId = @FinancialId OUTPUT;

    SET @Name = LTRIM(RTRIM(@Name));
    SET @ReasonNotCreated = NULLIF(LTRIM(RTRIM(@ReasonNotCreated)), N'');
    SET @Suggestions = ISNULL(@Suggestions, N'[]');
    IF @Name IS NULL OR LEN(@Name) NOT BETWEEN 1 AND 200
        THROW 50004, N'VALIDATION:A document name of 1 to 200 characters is required', 1;
    IF LEN(@ReasonNotCreated) > 2000
        THROW 50004, N'VALIDATION:The reason can hold at most 2000 characters', 1;
    EXEC dbo.usp_FinancialDocument_AssertSuggestions @Suggestions = @Suggestions;

    BEGIN TRAN;

    DECLARE @Lock INT;
    SELECT @Lock = FinancialId FROM app.Financial WITH (UPDLOCK, HOLDLOCK)
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;
    IF @Lock IS NULL
        THROW 50001, N'NOT_FOUND:Financial not found', 1;

    IF EXISTS (SELECT 1 FROM app.FinancialDocument
               WHERE FinancialId = @FinancialId AND [Name] = @Name AND IsDeleted = 0
                 AND FinancialDocumentId <> @FinancialDocumentId)
        THROW 50005, N'DUPLICATE:A document of that name is already listed', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT * FROM dbo.ufn_FinancialDocument_Row(@FinancialDocumentId) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.FinancialDocument SET
        [Name]           = @Name,
        IsRequired       = @IsRequired,
        ReasonNotCreated = @ReasonNotCreated,
        Suggestions      = @Suggestions,
        UpdatedAtUtc     = SYSUTCDATETIME(),
        UpdatedBy        = @ActorUserId
    WHERE FinancialDocumentId = @FinancialDocumentId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.FinancialDocument WHERE FinancialDocumentId = @FinancialDocumentId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Document not found', 1;
        THROW 50002, N'CONFLICT:The document was changed by someone else', 1;
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.FinancialDocument', CAST(@FinancialDocumentId AS NVARCHAR(64)), @Before,
            (SELECT * FROM dbo.ufn_FinancialDocument_Row(@FinancialDocumentId) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT * FROM dbo.ufn_FinancialDocument_Row(@FinancialDocumentId);
END;
GO
