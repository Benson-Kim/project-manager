-- usp_User_Update — profile/role/state update (NOT password — usp_User_SetPassword).
-- CONFLICT on @RowVer mismatch /0012); bumps SessionVersion when RoleId
-- or IsActive changes so live JWT sessions are revoked. Audits before/after
-- in-transaction. Module: auth-and-rbac (#4).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_User_Update
    @UserId             INT,
    @DisplayName        NVARCHAR(255),
    @Email              NVARCHAR(255) = NULL,
    @RoleId             INT,
    @IsActive           BIT,
    @MustChangePassword BIT,
    @RowVer             BIGINT,
    @ActorUserId        INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @DisplayName IS NULL OR LTRIM(RTRIM(@DisplayName)) = N''
        THROW 50004, N'VALIDATION:DisplayName is required', 1;
    IF NOT EXISTS (SELECT 1 FROM auth.Role WHERE RoleId = @RoleId)
        THROW 50004, N'VALIDATION:Unknown role', 1;

    DECLARE @Before NVARCHAR(MAX), @OldRoleId INT, @OldIsActive BIT;
    SELECT @Before = (SELECT UserId, Username, DisplayName, Email, RoleId, IsActive, MustChangePassword
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
           @OldRoleId = RoleId, @OldIsActive = IsActive
    FROM auth.[User]
    WHERE UserId = @UserId AND IsDeleted = 0;

    IF @Before IS NULL
        THROW 50001, N'NOT_FOUND:User not found', 1;

    BEGIN TRAN;

    UPDATE auth.[User]
    SET DisplayName = @DisplayName,
        Email = @Email,
        RoleId = @RoleId,
        IsActive = @IsActive,
        MustChangePassword = @MustChangePassword,
        SessionVersion = SessionVersion
            + CASE WHEN RoleId <> @RoleId OR IsActive <> @IsActive THEN 1 ELSE 0 END,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy = @ActorUserId
    WHERE UserId = @UserId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
    BEGIN
        ROLLBACK;
        THROW 50002, N'CONFLICT:User was changed by someone else — reload and retry', 1;
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'auth.User', CAST(@UserId AS NVARCHAR(64)), @Before,
            (SELECT UserId, Username, DisplayName, Email, RoleId, IsActive, MustChangePassword
             FROM auth.[User] WHERE UserId = @UserId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT u.UserId, u.Username, u.DisplayName, u.Email, u.RoleId, r.Name AS RoleName,
           u.IsActive, u.MustChangePassword, u.FailedLoginCount, u.LockedUntilUtc,
           u.SessionVersion, u.CreatedAtUtc, u.UpdatedAtUtc,
           CAST(u.RowVer AS BIGINT) AS RowVer
    FROM auth.[User] u
    JOIN auth.Role r ON r.RoleId = u.RoleId
    WHERE u.UserId = @UserId;
END;
GO
