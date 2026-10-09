-- usp_TodoAlert_AssertAccess — an alert follows its parent to-do's access rule (ADR-0021):
-- resolves the alert's TodoItemId and defers to dbo.usp_TodoItem_AssertAccess.
-- THROW 50001 NOT_FOUND when the alert is absent or deleted; 50003 FORBIDDEN_ROW otherwise.
-- Module: security-fixes (S1, docs/security/IDOR-getbyid-procs.md).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoAlert_AssertAccess
    @TodoAlertId INT,
    @ActorUserId INT,
    @MinLevel    NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TodoItemId INT;
    SELECT @TodoItemId = TodoItemId
    FROM app.TodoAlert
    WHERE TodoAlertId = @TodoAlertId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:TodoAlert not found', 1;

    EXEC dbo.usp_TodoItem_AssertAccess
        @TodoItemId = @TodoItemId, @ActorUserId = @ActorUserId, @MinLevel = @MinLevel;
END;
GO
