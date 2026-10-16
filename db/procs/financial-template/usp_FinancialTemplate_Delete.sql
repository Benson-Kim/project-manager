-- usp_FinancialTemplate_Delete - soft-delete a master template (ADR-0029). Admin only
-- (FORBIDDEN_ROW 50003). RowVer concurrency (CONFLICT 50002, NOT_FOUND 50001). Financials created
-- from it keep their copy and the template's name (app.Financial.TemplateName). Audited.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialTemplate_Delete
    @FinancialTemplateId INT,
    @RowVer              BIGINT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    IF @ActorRole <> N'Admin'
        THROW 50003, N'FORBIDDEN_ROW:Only administrators can delete financial templates', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT FinancialTemplateId, [Name], [Definition], IsDefault
         FROM app.FinancialTemplate WHERE FinancialTemplateId = @FinancialTemplateId AND IsDeleted = 0
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    IF @Before IS NULL
        THROW 50001, N'NOT_FOUND:Template not found', 1;

    UPDATE app.FinancialTemplate SET
        IsDeleted = 1, IsDefault = 0, DeletedAtUtc = SYSUTCDATETIME(), DeletedBy = @ActorUserId
    WHERE FinancialTemplateId = @FinancialTemplateId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:The template was changed by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.FinancialTemplate', CAST(@FinancialTemplateId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
