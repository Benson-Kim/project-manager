-- usp_FinancialTemplate_GetById - one live master template (ADR-0029); NOT_FOUND 50001 when
-- absent or deleted. Any active user (usp_User_GetActorRole: FORBIDDEN_ROW 50003 otherwise).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialTemplate_GetById
    @FinancialTemplateId INT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    IF NOT EXISTS (SELECT 1 FROM app.FinancialTemplate
                   WHERE FinancialTemplateId = @FinancialTemplateId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Template not found', 1;

    SELECT FinancialTemplateId, [Name], [Definition], IsDefault, CreatedAtUtc, UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.FinancialTemplate
    WHERE FinancialTemplateId = @FinancialTemplateId;
END;
GO
