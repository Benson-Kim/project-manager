-- usp_Project_GetAccess — the actor's effective access level, for the UI to show or hide
-- actions (ADR-0021). One row: AccessLevel = Manager | Contributor | Viewer, or NULL (no access),
-- and OverridesJson — the actor's per-person overrides in this project (ADR-0024), a JSON array of
-- {Module, Verb, Allowed}, NULL when none (always NULL for Admins and project-less records).
-- @ProjectId NULL answers for project-less records. Enforcement stays in the procs themselves.
-- Module: security-fixes (S1, docs/security/IDOR-getbyid-procs.md).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Project_GetAccess
    @ProjectId   INT = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Level NVARCHAR(20);
    EXEC dbo.usp_Project_ResolveAccess
        @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
        @AllowProjectless = 1, @Level = @Level OUTPUT;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    SELECT @Level AS AccessLevel,
           CASE WHEN @Level IS NOT NULL AND @ActorRole <> N'Admin' THEN
               (SELECT o.[Module], o.Verb, o.Allowed
                FROM app.ProjectPermissionOverride o
                WHERE o.ProjectId = @ProjectId AND o.UserId = @ActorUserId
                FOR JSON PATH)
           END AS OverridesJson;
END;
GO
