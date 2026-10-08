-- usp_Project_AssertAccess — the guard every project-scoped proc calls (ADR-0021, ADR-0012 FORBIDDEN_ROW).
-- Returns silently when the actor holds at least @MinLevel on @ProjectId; otherwise THROW 50003.
--   * @MinLevel is required, so no proc can fall back to a permissive default:
--     reads pass N'Viewer'; writes pass the level the module needs (docs/PLAN.md §9).
--   * @AllowProjectless = 1 for tables whose rows may have no project (daily activities,
--     keywords, to-dos); see dbo.usp_Project_ResolveAccess for that shared space.
-- Module: security-fixes (S1, docs/security/IDOR-getbyid-procs.md).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Project_AssertAccess
    @ProjectId        INT,
    @ActorUserId      INT,
    @MinLevel         NVARCHAR(20),
    @AllowProjectless BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Level NVARCHAR(20);
    EXEC dbo.usp_Project_ResolveAccess
        @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
        @AllowProjectless = @AllowProjectless, @Level = @Level OUTPUT;
    EXEC dbo.usp_AccessLevel_Require @Level = @Level, @MinLevel = @MinLevel;
END;
GO
