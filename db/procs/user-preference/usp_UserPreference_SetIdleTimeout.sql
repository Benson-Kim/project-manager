-- Upserts the signed-in user's idle sign-out time (migration 060); 0 = Never. The caller passes
-- the session's user id only, so a user can never change someone else's settings.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_UserPreference_SetIdleTimeout
    @ActorUserId        INT,
    @IdleTimeoutMinutes INT
AS
BEGIN
    SET NOCOUNT ON;
    IF @IdleTimeoutMinutes IS NULL
       OR (@IdleTimeoutMinutes <> 0 AND @IdleTimeoutMinutes NOT BETWEEN 5 AND 1440)
        THROW 50004, N'VALIDATION:Idle sign-out must be Never or between 5 minutes and 24 hours', 1;

    MERGE app.UserPreference AS target
    USING (SELECT @ActorUserId AS UserId) AS source
        ON target.UserId = source.UserId
    WHEN MATCHED THEN
        UPDATE SET IdleTimeoutMinutes = @IdleTimeoutMinutes, UpdatedAtUtc = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (UserId, IdleTimeoutMinutes)
        VALUES (@ActorUserId, @IdleTimeoutMinutes);
END;
GO
