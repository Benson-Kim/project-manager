-- usp_FinancialDocument_AssertAccess - resolves a live document of a live financial (NOT_FOUND
-- 50001 otherwise) and checks the actor's level on the financial's project through
-- dbo.usp_Financial_AssertAccess (ADR-0021/0030; FORBIDDEN_ROW 50003), passing @Permission for
-- per-person overrides (ADR-0024). The project always comes from the rows, never from the caller.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_AssertAccess
    @FinancialDocumentId INT,
    @ActorUserId         INT,
    @MinLevel            NVARCHAR(20),
    @Permission          NVARCHAR(64) = NULL,
    @FinancialId         INT          = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    SET @FinancialId = NULL;
    SELECT @FinancialId = FinancialId FROM app.FinancialDocument
    WHERE FinancialDocumentId = @FinancialDocumentId AND IsDeleted = 0;
    IF @FinancialId IS NULL
        THROW 50001, N'NOT_FOUND:Document not found', 1;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId,
         @MinLevel = @MinLevel, @Permission = @Permission;
END;
GO
