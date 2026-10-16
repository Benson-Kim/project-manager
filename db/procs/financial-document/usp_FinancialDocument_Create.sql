-- usp_FinancialDocument_Create - add a document to a financial's checklist (ADR-0030), at the end.
-- Access: Manager with 'financials:create' on the financial's project (usp_Financial_AssertAccess).
-- Validation (50004): name 1-200; reason at most 2000; @IsRequired NULL (not decided), 0 or 1;
--   suggestions per usp_FinancialDocument_AssertSuggestions; at most 50 live documents per
--   financial, counted under an update lock on the financial row. A live document of the same
--   name is DUPLICATE 50005. The reason is never required (requirements.md section 6).
-- Audited in-transaction; returns dbo.ufn_FinancialDocument_Row.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_Create
    @FinancialId      INT,
    @Name             NVARCHAR(400),
    @IsRequired       BIT           = NULL,
    @ReasonNotCreated NVARCHAR(MAX) = NULL,
    @Suggestions      NVARCHAR(MAX) = N'[]',
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:create';

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

    IF (SELECT COUNT(*) FROM app.FinancialDocument WHERE FinancialId = @FinancialId AND IsDeleted = 0) >= 50
        THROW 50004, N'VALIDATION:A financial can hold at most 50 documents', 1;
    IF EXISTS (SELECT 1 FROM app.FinancialDocument
               WHERE FinancialId = @FinancialId AND [Name] = @Name AND IsDeleted = 0)
        THROW 50005, N'DUPLICATE:A document of that name is already listed', 1;

    INSERT INTO app.FinancialDocument (FinancialId, [Name], IsRequired, ReasonNotCreated, Suggestions,
                                       SortOrder, CreatedBy)
    VALUES (@FinancialId, @Name, @IsRequired, @ReasonNotCreated, @Suggestions,
            ISNULL((SELECT MAX(SortOrder) FROM app.FinancialDocument
                    WHERE FinancialId = @FinancialId AND IsDeleted = 0), 0) + 1,
            @ActorUserId);
    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.FinancialDocument', CAST(@Id AS NVARCHAR(64)),
            (SELECT * FROM dbo.ufn_FinancialDocument_Row(@Id) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT * FROM dbo.ufn_FinancialDocument_Row(@Id);
END;
GO
