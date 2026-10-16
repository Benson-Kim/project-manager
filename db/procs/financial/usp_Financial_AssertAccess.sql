-- usp_Financial_AssertAccess - resolves a live financial's project (NOT_FOUND 50001 when absent
-- or deleted) and checks the actor's level on it with dbo.usp_Project_AssertAccess (ADR-0021,
-- FORBIDDEN_ROW 50003), passing @Permission for per-person overrides (ADR-0024). The project
-- always comes from the row, never from the caller. Lines and transactions resolve their
-- financial first and call this with it.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Financial_AssertAccess
    @FinancialId INT,
    @ActorUserId INT,
    @MinLevel    NVARCHAR(20),
    @Permission  NVARCHAR(64) = NULL,
    @ProjectId   INT          = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    SET @ProjectId = NULL;
    SELECT @ProjectId = ProjectId FROM app.Financial WHERE FinancialId = @FinancialId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Financial not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = @MinLevel, @AllowProjectless = 0, @Permission = @Permission;
END;
GO
