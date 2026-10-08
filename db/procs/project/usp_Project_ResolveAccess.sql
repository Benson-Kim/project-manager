-- usp_Project_ResolveAccess — the ONE rule for an actor's effective access level (ADR-0021).
--   * Admin (global role, read from auth.User — never trusted from the caller) -> Manager everywhere.
--   * @ProjectId given -> the highest AccessLevel among the actor's active app.ProjectAssignee
--     rows for that project; NULL when the actor is not assigned.
--   * @ProjectId NULL (a project-less record) -> Contributor when @AllowProjectless = 1: the
--     shared space every user may read and edit, where deleting needs Manager (Admin); else NULL.
-- THROW 50003 FORBIDDEN_ROW for an unknown or inactive actor (dbo.usp_User_GetActorRole).
-- Callers: dbo.usp_Project_AssertAccess, dbo.usp_Project_GetAccess, dbo.usp_TodoItem_AssertAccess.
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
    IF @ActorRole = N'Admin'
        SET @Level = N'Manager';
    ELSE IF @ProjectId IS NULL
        SET @Level = CASE WHEN @AllowProjectless = 1 THEN N'Contributor' END;
    ELSE
        SELECT TOP (1) @Level = pa.AccessLevel
        FROM app.ProjectAssignee pa
        JOIN auth.AccessLevel al ON al.Name = pa.AccessLevel
        WHERE pa.ProjectId = @ProjectId AND pa.UserId = @ActorUserId AND pa.IsDeleted = 0
        ORDER BY al.[Rank] DESC;
END;
GO
