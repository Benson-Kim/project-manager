-- usp_Financial_GetById - one live financial (dbo.ufn_Financial_Row, ADR-0029).
-- Access: Viewer on its project (usp_Financial_AssertAccess; NOT_FOUND 50001, FORBIDDEN_ROW 50003).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Financial_GetById
    @FinancialId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    SELECT * FROM dbo.ufn_Financial_Row(@FinancialId);
END;
GO
