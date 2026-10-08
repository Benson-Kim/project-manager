-- ufn_TodoItem_AccessLevel — the to-do access rule (ADR-0021) as an inline table-valued function,
-- so dbo.usp_TodoItem_AssertAccess (one to-do) and the to-do/alert list procs (every row) share it:
--   * The project rule applies first (dbo.ufn_AccessLevel_Resolve; project-less to-dos allowed).
--   * A to-do belongs to its creator. Outside a project the owner holds Manager on it; inside one,
--     the owner is bounded by their project level (NULL when no longer assigned).
--   * Someone else's to-do needs Manager: that project's managers, or an Admin. Otherwise NULL.
-- @ActorRole must come from dbo.usp_User_GetActorRole. Procs only; the application never calls it.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_TodoItem_AccessLevel
(
    @ActorRole   NVARCHAR(50),
    @ActorUserId INT,
    @ProjectId   INT,
    @OwnerUserId INT
)
RETURNS TABLE
AS
RETURN
    SELECT AccessLevel = CAST(
        CASE WHEN @OwnerUserId = @ActorUserId
                 THEN CASE WHEN @ProjectId IS NULL THEN N'Manager' ELSE r.AccessLevel END
             WHEN r.AccessLevel = N'Manager' THEN N'Manager'
        END AS NVARCHAR(20))
    FROM dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, @ProjectId, 1) r;
GO
