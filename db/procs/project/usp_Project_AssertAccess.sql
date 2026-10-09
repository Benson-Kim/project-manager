-- usp_Project_AssertAccess — the guard every project-scoped proc calls (ADR-0021, ADR-0012 FORBIDDEN_ROW).
-- Returns silently when the actor holds at least @MinLevel on @ProjectId; otherwise THROW 50003.
--   * @MinLevel is required, so no proc can fall back to a permissive default:
--     reads pass N'Viewer'; writes pass the level the module needs (docs/PLAN.md §9).
--   * @AllowProjectless = 1 for tables whose rows may have no project (daily activities,
--     keywords, to-dos); see dbo.usp_Project_ResolveAccess for that shared space.
--   * @Permission ('<section>:create|update|delete', ADR-0024) is passed by the write procs of project
--     sections: a per-person override in this project then decides instead of the level
--     (dbo.usp_Permission_Require). src/tests/proc-access-levels.test.ts checks every literal.
-- Module: security-fixes (S1, docs/security/IDOR-getbyid-procs.md).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Project_AssertAccess
    @ProjectId        INT,
    @ActorUserId      INT,
    @MinLevel         NVARCHAR(20),
    @AllowProjectless BIT = 0,
    @Permission       NVARCHAR(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Level NVARCHAR(20);
    EXEC dbo.usp_Project_ResolveAccess
        @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
        @AllowProjectless = @AllowProjectless, @Level = @Level OUTPUT;

    DECLARE @ActorRole NVARCHAR(50);
    IF @Permission IS NOT NULL
        EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    EXEC dbo.usp_Permission_Require
        @Level = @Level, @MinLevel = @MinLevel, @ProjectId = @ProjectId,
        @ActorUserId = @ActorUserId, @ActorRole = @ActorRole, @Permission = @Permission;
END;
GO
