-- usp_User_List — paged/filtered list per ADR-0016. Search columns: Username,
-- DisplayName, Email. Sort whitelist: Username, DisplayName, Email.
-- Never returns PasswordHash. Module: auth-and-rbac (#4).

-- @ProjectId is accepted for contract uniformity but ignored (entity is not project-scoped).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_User_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25
AS
BEGIN
    SET NOCOUNT ON;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    SELECT u.UserId, u.Username, u.DisplayName, u.Email, u.RoleId, r.Name AS RoleName,
           u.IsActive, u.MustChangePassword, u.FailedLoginCount, u.LockedUntilUtc,
           u.SessionVersion, u.CreatedAtUtc, u.UpdatedAtUtc,
           CAST(u.RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM auth.[User] u
    JOIN auth.Role r ON r.RoleId = u.RoleId
    WHERE u.IsDeleted = 0
      AND (@Search IS NULL OR u.Username LIKE N'%' + @Search + N'%'
           OR u.DisplayName LIKE N'%' + @Search + N'%'
           OR u.Email LIKE N'%' + @Search + N'%')
    ORDER BY
        CASE WHEN @SortBy = N'Username' AND @SortDir = 'asc'  THEN u.Username END ASC,
        CASE WHEN @SortBy = N'Username' AND @SortDir = 'desc' THEN u.Username END DESC,
        CASE WHEN @SortBy = N'DisplayName' AND @SortDir = 'asc'  THEN u.DisplayName END ASC,
        CASE WHEN @SortBy = N'DisplayName' AND @SortDir = 'desc' THEN u.DisplayName END DESC,
        CASE WHEN @SortBy = N'Email' AND @SortDir = 'asc'  THEN u.Email END ASC,
        CASE WHEN @SortBy = N'Email' AND @SortDir = 'desc' THEN u.Email END DESC,
        u.UserId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
