-- usp_FinancialTemplate_List - every live master template (ADR-0029), default first, then by
-- name. Any active user (usp_User_GetActorRole: FORBIDDEN_ROW 50003 for unknown or inactive
-- users): a project Manager picks one when creating project financials. At most 200 rows.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialTemplate_List
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    SELECT TOP (200)
           FinancialTemplateId, [Name], [Definition], IsDefault, CreatedAtUtc, UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.FinancialTemplate
    WHERE IsDeleted = 0
    ORDER BY IsDefault DESC, [Name], FinancialTemplateId;
END;
GO
