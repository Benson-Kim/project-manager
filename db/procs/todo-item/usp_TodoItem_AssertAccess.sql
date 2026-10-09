-- usp_TodoItem_AssertAccess — asserts the to-do access rule (ADR-0021) for one to-do; shared by every
-- to-do and alert proc. The rule itself is dbo.ufn_TodoItem_AccessLevel:
--   * The project rule applies first (project-less to-dos allowed).
--   * A to-do belongs to its creator. Outside a project the owner holds Manager on it; inside one,
--     the owner is bounded by their project level (e.g. deleting needs Manager there).
--   * Someone else's to-do needs Manager: that project's managers, or an Admin.
-- @Permission (write procs, ADR-0024): a per-person override in the to-do's project decides instead
-- of the level (dbo.usp_Permission_Require).
-- THROW 50001 NOT_FOUND when the to-do is absent or deleted; 50003 FORBIDDEN_ROW otherwise.
-- Module: security-fixes (S1, docs/security/IDOR-getbyid-procs.md).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_AssertAccess
    @TodoItemId  INT,
    @ActorUserId INT,
    @MinLevel    NVARCHAR(20),
    @Permission  NVARCHAR(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ProjectId INT, @OwnerUserId INT, @Level NVARCHAR(20), @ActorRole NVARCHAR(50);
    SELECT @ProjectId = ProjectId, @OwnerUserId = CreatedBy
    FROM app.TodoItem
    WHERE TodoItemId = @TodoItemId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:TodoItem not found', 1;

    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    SELECT @Level = AccessLevel
    FROM dbo.ufn_TodoItem_AccessLevel(@ActorRole, @ActorUserId, @ProjectId, @OwnerUserId);

    IF @Level IS NULL AND @OwnerUserId <> @ActorUserId
        THROW 50003, N'FORBIDDEN_ROW:This to-do belongs to another user', 1;

    EXEC dbo.usp_Permission_Require
        @Level = @Level, @MinLevel = @MinLevel, @ProjectId = @ProjectId,
        @ActorUserId = @ActorUserId, @ActorRole = @ActorRole, @Permission = @Permission;
END;
GO
