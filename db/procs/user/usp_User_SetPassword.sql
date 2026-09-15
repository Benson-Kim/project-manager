-- usp_User_SetPassword — replace the argon2id hash; clears MustChangePassword
-- (unless the actor is forcing a reset with @MustChangePassword = 1), resets
-- lockout counters and bumps SessionVersion so every other session is revoked.
-- The audit row NEVER contains the hash. Module: auth-and-rbac (#4).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_User_SetPassword
    @UserId             INT,
    @PasswordHash       NVARCHAR(255),
    @MustChangePassword BIT = 0,
    @ActorUserId        INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @PasswordHash IS NULL OR LTRIM(RTRIM(@PasswordHash)) = N''
        THROW 50004, N'VALIDATION:PasswordHash is required', 1;
    IF NOT EXISTS (SELECT 1 FROM auth.[User] WHERE UserId = @UserId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:User not found', 1;

    BEGIN TRAN;

    UPDATE auth.[User]
    SET PasswordHash = @PasswordHash,
        MustChangePassword = @MustChangePassword,
        FailedLoginCount = 0,
        LockedUntilUtc = NULL,
        SessionVersion = SessionVersion + 1,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy = @ActorUserId
    WHERE UserId = @UserId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'SetPassword', N'auth.User', CAST(@UserId AS NVARCHAR(64)),
            (SELECT UserId, MustChangePassword, SessionVersion
             FROM auth.[User] WHERE UserId = @UserId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT u.UserId, u.SessionVersion, CAST(u.RowVer AS BIGINT) AS RowVer
    FROM auth.[User] u
    WHERE u.UserId = @UserId;
END;
GO
