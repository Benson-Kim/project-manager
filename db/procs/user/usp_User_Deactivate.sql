-- usp_User_Deactivate — set IsActive = 0 and bump SessionVersion (revokes live
-- JWT sessions immediately). Users are deactivated, not soft-deleted: their
-- identity must survive for audit attribution. CONFLICT on @RowVer mismatch.
-- Module: auth-and-rbac (#4).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_User_Deactivate
    @UserId      INT,
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Before NVARCHAR(MAX);
    SELECT @Before = (SELECT UserId, Username, IsActive, SessionVersion
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM auth.[User]
    WHERE UserId = @UserId AND IsDeleted = 0;

    IF @Before IS NULL
        THROW 50001, N'NOT_FOUND:User not found', 1;

    BEGIN TRAN;

    UPDATE auth.[User]
    SET IsActive = 0,
        SessionVersion = SessionVersion + 1,
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
    VALUES (@ActorUserId, N'Deactivate', N'auth.User', CAST(@UserId AS NVARCHAR(64)), @Before,
            (SELECT UserId, Username, IsActive, SessionVersion
             FROM auth.[User] WHERE UserId = @UserId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;
END;
GO
