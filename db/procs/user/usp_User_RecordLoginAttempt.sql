-- usp_User_RecordLoginAttempt — per-user lockout state machine + in-proc audit
-- (STANDARDS §4: username lockout with backoff). On success: counters reset,
-- audit Action = 'Login'. On failure: FailedLoginCount += 1 and from the 5th
-- consecutive failure the account locks with exponential backoff
-- (30 s · 2^(n-5), capped at 30 min); audit Action = 'LoginFailed'.
-- Returns the post-update lockout state. Module: auth-and-rbac (#4).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_User_RecordLoginAttempt
    @UserId    INT,
    @Success   BIT,
    @IpAddress NVARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM auth.[User] WHERE UserId = @UserId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:User not found', 1;

    BEGIN TRAN;

    IF @Success = 1
    BEGIN
        UPDATE auth.[User]
        SET FailedLoginCount = 0, LockedUntilUtc = NULL
        WHERE UserId = @UserId;

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, IpAddress)
        VALUES (@UserId, N'Login', N'auth.User', CAST(@UserId AS NVARCHAR(64)), @IpAddress);
    END
    ELSE
    BEGIN
        UPDATE auth.[User]
        SET FailedLoginCount = FailedLoginCount + 1,
            LockedUntilUtc = CASE
                WHEN FailedLoginCount + 1 >= 5 THEN DATEADD(SECOND,
                    CASE WHEN 30 * POWER(2, CASE WHEN FailedLoginCount + 1 - 5 > 6 THEN 6
                                               ELSE FailedLoginCount + 1 - 5 END) > 1800
                         THEN 1800
                         ELSE 30 * POWER(2, CASE WHEN FailedLoginCount + 1 - 5 > 6 THEN 6
                                               ELSE FailedLoginCount + 1 - 5 END) END,
                    SYSUTCDATETIME())
                ELSE LockedUntilUtc END
        WHERE UserId = @UserId;

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, IpAddress)
        VALUES (@UserId, N'LoginFailed', N'auth.User', CAST(@UserId AS NVARCHAR(64)), @IpAddress);
    END;

    COMMIT;

    SELECT FailedLoginCount, LockedUntilUtc
    FROM auth.[User]
    WHERE UserId = @UserId;
END;
GO
