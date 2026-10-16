-- usp_FinancialDocument_CreateFromTemplate - copy a master template's documents into a financial's
-- checklist (ADR-0030), for financials made blank or before templates carried documents. A copy
-- (snapshot) like usp_Financial_Create's: documents whose name the financial already lists are
-- skipped, the rest go at the end in template order with their default required flag, reason and
-- suggestions. The financial may hold at most 50 live documents afterwards (VALIDATION 50004).
-- Access: Manager with 'financials:create' on the financial's project. A deleted or unknown template
-- is NOT_FOUND 50001; its document is re-checked first. Audited in-transaction.
-- Returns Added (the number of documents copied).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_CreateFromTemplate
    @FinancialId         INT,
    @FinancialTemplateId INT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:create';

    DECLARE @Definition NVARCHAR(MAX) =
        (SELECT [Definition] FROM app.FinancialTemplate
         WHERE FinancialTemplateId = @FinancialTemplateId AND IsDeleted = 0);
    IF @Definition IS NULL
        THROW 50001, N'NOT_FOUND:Template not found', 1;
    EXEC dbo.usp_FinancialTemplate_AssertDefinition @Definition = @Definition;

    BEGIN TRAN;

    DECLARE @Lock INT;
    SELECT @Lock = FinancialId FROM app.Financial WITH (UPDLOCK, HOLDLOCK)
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;
    IF @Lock IS NULL
        THROW 50001, N'NOT_FOUND:Financial not found', 1;

    DECLARE @Incoming TABLE (Ordinal INT, [Name] NVARCHAR(200), IsRequired BIT,
                             ReasonNotCreated NVARCHAR(2000), Suggestions NVARCHAR(MAX));
    INSERT INTO @Incoming (Ordinal, [Name], IsRequired, ReasonNotCreated, Suggestions)
    SELECT CAST(d.[key] AS INT), LTRIM(RTRIM(v.[Name])), v.IsRequired,
           NULLIF(LTRIM(RTRIM(v.Reason)), N''), ISNULL(v.Suggestions, N'[]')
    FROM OPENJSON(@Definition, N'$.documents') AS d
    CROSS APPLY OPENJSON(d.[value]) WITH (
        [Name] NVARCHAR(200) N'$.name', IsRequired BIT N'$.required',
        Reason NVARCHAR(2000) N'$.reason', Suggestions NVARCHAR(MAX) N'$.suggestions' AS JSON) AS v
    WHERE NOT EXISTS (SELECT 1 FROM app.FinancialDocument AS x
                      WHERE x.FinancialId = @FinancialId AND x.IsDeleted = 0
                        AND x.[Name] = LTRIM(RTRIM(v.[Name])));

    DECLARE @Added INT = (SELECT COUNT(*) FROM @Incoming);
    IF @Added + (SELECT COUNT(*) FROM app.FinancialDocument WHERE FinancialId = @FinancialId AND IsDeleted = 0) > 50
        THROW 50004, N'VALIDATION:A financial can hold at most 50 documents', 1;

    DECLARE @Base INT = ISNULL((SELECT MAX(SortOrder) FROM app.FinancialDocument
                                WHERE FinancialId = @FinancialId AND IsDeleted = 0), 0);
    INSERT INTO app.FinancialDocument (FinancialId, [Name], IsRequired, ReasonNotCreated, Suggestions,
                                       SortOrder, CreatedBy)
    SELECT @FinancialId, [Name], IsRequired, ReasonNotCreated, Suggestions,
           @Base + ROW_NUMBER() OVER (ORDER BY Ordinal), @ActorUserId
    FROM @Incoming;

    IF @Added > 0
        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
        VALUES (@ActorUserId, N'CreateFromTemplate', N'app.Financial', CAST(@FinancialId AS NVARCHAR(64)),
                (SELECT @FinancialTemplateId AS FinancialTemplateId,
                        (SELECT [Name] FROM @Incoming ORDER BY Ordinal FOR JSON PATH) AS Documents
                 FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @Added AS Added;
END;
GO
