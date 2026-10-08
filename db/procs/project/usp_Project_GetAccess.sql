-- usp_Project_GetAccess — the actor's effective access level, for the UI to show or hide
-- actions (ADR-0021). One row: AccessLevel = Manager | Contributor | Viewer, or NULL (no access).
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
    SELECT @Level AS AccessLevel;
END;
GO
