-- ufn_Board_AccessLevel — the board access rule (ADR-0038) as an inline table-valued function, so
-- dbo.usp_Board_AssertAccess (one board) and the board list procs (every row) share it:
--   * A board with a project follows that project (dbo.ufn_AccessLevel_Resolve): Admin is Manager,
--     an assigned user holds their level there, anyone else NULL.
--   * A standalone board (ProjectId NULL) is the shared space, like project-less daily activities:
--     every user is a Contributor, and its creator — or an Admin — is its Manager, so only they can
--     delete it or link it to a project.
-- Called with the board's own ProjectId and CreatedBy, never values from the caller. @ActorRole must
-- come from dbo.usp_User_GetActorRole. Procs only; the application never calls it.
-- Lives in db/procs/board/ and is named ufn_*, so both appliers create it before this folder's procs.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_Board_AccessLevel
(
    @ActorRole   NVARCHAR(50),
    @ActorUserId INT,
    @ProjectId   INT,
    @CreatedBy   INT
)
RETURNS TABLE
AS
RETURN
    SELECT AccessLevel = CAST(
        CASE WHEN @ProjectId IS NULL
                 THEN CASE WHEN @ActorRole = N'Admin' OR @CreatedBy = @ActorUserId
                               THEN N'Manager'
                           ELSE N'Contributor'
                      END
             ELSE r.AccessLevel
        END AS NVARCHAR(20))
    FROM dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, @ProjectId, 0) r;
GO
