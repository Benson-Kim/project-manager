-- usp_Project_ResolveAccess — an actor's effective access level on one project (ADR-0021). The rule
-- itself is dbo.ufn_AccessLevel_Resolve; this proc validates the actor and reads their role first:
--   * Admin (global role, read from auth.User — never trusted from the caller) -> Manager everywhere.
--   * @ProjectId given -> the highest AccessLevel among the actor's active app.ProjectAssignee
--     rows for that project; NULL when the actor is not assigned.
--   * @ProjectId NULL (a project-less record) -> Contributor when @AllowProjectless = 1: the
--     shared space every user may read and edit, where deleting needs Manager (Admin); else NULL.
-- THROW 50003 FORBIDDEN_ROW for an unknown or inactive actor (dbo.usp_User_GetActorRole).
-- Callers: dbo.usp_Project_AssertAccess, dbo.usp_Project_GetAccess.
-- Module: security-fixes (S1, docs/security/IDOR-getbyid-procs.md).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Project_ResolveAccess
    @ProjectId        INT,
    @ActorUserId      INT,
    @AllowProjectless BIT,
    @Level            NVARCHAR(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    SET @Level = NULL;
    SELECT @Level = AccessLevel
    FROM dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, @ProjectId, @AllowProjectless);
END;
GO
