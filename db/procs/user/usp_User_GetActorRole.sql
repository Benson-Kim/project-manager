-- usp_User_GetActorRole — resolve the acting user's role from auth.User (the single source of truth).
-- Procs never trust a caller-supplied role: they pass @ActorUserId and read the role here, so a
-- demoted or deactivated user loses access at once instead of when their session expires.
-- THROW 50003 FORBIDDEN_ROW when the user is unknown, inactive or deleted.
-- Usage:  DECLARE @ActorRole NVARCHAR(50);
--         EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
-- Module: security-fixes (S1, docs/security/IDOR-getbyid-procs.md).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_User_GetActorRole
    @UserId INT,
    @Role   NVARCHAR(50) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    SET @Role = NULL;
    SELECT @Role = r.Name
    FROM auth.[User] u
    JOIN auth.Role r ON r.RoleId = u.RoleId
    WHERE u.UserId = @UserId AND u.IsActive = 1 AND u.IsDeleted = 0;

    IF @Role IS NULL
        THROW 50003, N'FORBIDDEN_ROW:Unknown or inactive user', 1;
END;
GO
