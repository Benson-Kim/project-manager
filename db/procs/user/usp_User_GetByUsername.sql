-- usp_User_GetByUsername — credentials-provider lookup: the ONLY proc that
-- returns PasswordHash. Returns an empty result set (no THROW) when the user
-- does not exist so the caller can keep the login failure message generic
-- without exception-based control flow. Module: auth-and-rbac (#4).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_User_GetByUsername
    @Username NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT u.UserId, u.Username, u.PasswordHash, u.DisplayName, u.Email,
           u.RoleId, r.Name AS RoleName, u.IsActive, u.MustChangePassword,
           u.FailedLoginCount, u.LockedUntilUtc, u.SessionVersion,
           u.CreatedAtUtc, u.UpdatedAtUtc,
           CAST(u.RowVer AS BIGINT) AS RowVer
    FROM auth.[User] u
    JOIN auth.Role r ON r.RoleId = u.RoleId
    WHERE u.Username = @Username AND u.IsDeleted = 0;
END;
GO
