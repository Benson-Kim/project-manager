-- Upserts the signed-in user's "Due soon" window (migration 059). The caller passes the
-- session's user id only, so a user can never change someone else's settings.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_UserPreference_SetDueSoonDays
    @ActorUserId INT,
    @DueSoonDays INT
AS
BEGIN
    SET NOCOUNT ON;
    IF @DueSoonDays IS NULL OR @DueSoonDays NOT BETWEEN 1 AND 30
        THROW 50004, N'VALIDATION:Due soon must be between 1 and 30 days', 1;

    MERGE app.UserPreference AS target
    USING (SELECT @ActorUserId AS UserId) AS source
        ON target.UserId = source.UserId
    WHEN MATCHED THEN
        UPDATE SET DueSoonDays = @DueSoonDays, UpdatedAtUtc = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (UserId, DueSoonDays)
        VALUES (@ActorUserId, @DueSoonDays);
END;
GO
