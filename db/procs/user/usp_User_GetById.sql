-- usp_User_GetById — one auth.User row by id; NOT_FOUND when missing/deleted.
-- Never returns PasswordHash. Module: auth-and-rbac (#4).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_User_GetById
    @UserId      INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM auth.[User] WHERE UserId = @UserId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:User not found', 1;

    SELECT u.UserId, u.Username, u.DisplayName, u.Email, u.RoleId, r.Name AS RoleName,
           u.IsActive, u.MustChangePassword, u.FailedLoginCount, u.LockedUntilUtc,
           u.SessionVersion, u.CreatedAtUtc, u.UpdatedAtUtc,
           CAST(u.RowVer AS BIGINT) AS RowVer
    FROM auth.[User] u
    JOIN auth.Role r ON r.RoleId = u.RoleId
    WHERE u.UserId = @UserId AND u.IsDeleted = 0;
END;
GO
