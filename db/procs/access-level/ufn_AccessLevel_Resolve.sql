-- ufn_AccessLevel_Resolve — the ONE rule for an actor's effective access level (ADR-0021), as an
-- inline table-valued function so a list proc can resolve it for every row it returns (ADR-0023):
--   * @ActorRole 'Admin' -> Manager everywhere.
--   * @ProjectId NULL (a project-less record) -> Contributor when @AllowProjectless = 1: the
--     shared space every user may read and edit, where deleting needs Manager (Admin); else NULL.
--   * Otherwise -> the highest AccessLevel among the actor's active app.ProjectAssignee rows for
--     that project; NULL when the actor is not assigned.
-- @ActorRole must come from dbo.usp_User_GetActorRole (which also rejects unknown or inactive
-- actors), never from the caller's caller. Procs only; the application never calls it.
-- Callers: dbo.usp_Project_ResolveAccess (one project), dbo.usp_DailyActivity_List (per row).
-- Lives in db/procs/access-level/ so db-apply creates it before the procs that use it.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_AccessLevel_Resolve
(
    @ActorRole        NVARCHAR(50),
    @ActorUserId      INT,
    @ProjectId        INT,
    @AllowProjectless BIT
)
RETURNS TABLE
AS
RETURN
    SELECT AccessLevel = CAST(
        CASE WHEN @ActorRole = N'Admin' THEN N'Manager'
             WHEN @ProjectId IS NULL THEN CASE WHEN @AllowProjectless = 1 THEN N'Contributor' END
             ELSE (SELECT TOP (1) pa.AccessLevel
                   FROM app.ProjectAssignee pa
                   JOIN auth.AccessLevel al ON al.Name = pa.AccessLevel
                   WHERE pa.ProjectId = @ProjectId AND pa.UserId = @ActorUserId AND pa.IsDeleted = 0
                   ORDER BY al.[Rank] DESC)
        END AS NVARCHAR(20));
GO
