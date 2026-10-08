-- usp_TodoItem_AssertAccess — the to-do access rule (ADR-0021), shared by every to-do and alert proc.
--   * The project rule applies first (dbo.usp_Project_ResolveAccess; project-less to-dos allowed).
--   * A to-do belongs to its creator. Outside a project the owner holds Manager on it; inside one,
--     the owner is bounded by their project level (e.g. deleting needs Manager there).
--   * Someone else's to-do needs Manager: that project's managers, or an Admin.
-- THROW 50001 NOT_FOUND when the to-do is absent or deleted; 50003 FORBIDDEN_ROW otherwise.
-- Module: security-fixes (S1, docs/security/IDOR-getbyid-procs.md).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_AssertAccess
    @TodoItemId  INT,
    @ActorUserId INT,
    @MinLevel    NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ProjectId INT, @OwnerUserId INT, @Level NVARCHAR(20);
    SELECT @ProjectId = ProjectId, @OwnerUserId = CreatedBy
    FROM app.TodoItem
    WHERE TodoItemId = @TodoItemId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:TodoItem not found', 1;

    EXEC dbo.usp_Project_ResolveAccess
        @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
        @AllowProjectless = 1, @Level = @Level OUTPUT;

    IF @OwnerUserId = @ActorUserId
    BEGIN
        IF @ProjectId IS NULL
            SET @Level = N'Manager';
    END
    ELSE IF ISNULL(@Level, N'') <> N'Manager'
        THROW 50003, N'FORBIDDEN_ROW:This to-do belongs to another user', 1;

    EXEC dbo.usp_AccessLevel_Require @Level = @Level, @MinLevel = @MinLevel;
END;
GO
