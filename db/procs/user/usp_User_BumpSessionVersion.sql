-- usp_User_BumpSessionVersion — server-side JWT revocation : tokens
-- carry the SessionVersion they were minted with; bumping it invalidates every
-- outstanding session on the next request. Module: auth-and-rbac (#4).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_User_BumpSessionVersion
    @UserId      INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM auth.[User] WHERE UserId = @UserId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:User not found', 1;

    BEGIN TRAN;

    UPDATE auth.[User]
    SET SessionVersion = SessionVersion + 1,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy = @ActorUserId
    WHERE UserId = @UserId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'BumpSessionVersion', N'auth.User', CAST(@UserId AS NVARCHAR(64)),
            (SELECT UserId, SessionVersion FROM auth.[User] WHERE UserId = @UserId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT SessionVersion FROM auth.[User] WHERE UserId = @UserId;
END;
GO
