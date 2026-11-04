-- The signed-in user's own settings (migrations 059, 060). Always one row: the defaults when the
-- user has never saved any.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_UserPreference_Get
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CAST(COALESCE(p.DueSoonDays, 2) AS INT) AS DueSoonDays,
           CAST(COALESCE(p.IdleTimeoutMinutes, 480) AS INT) AS IdleTimeoutMinutes
    FROM (SELECT @ActorUserId AS UserId) AS u
    LEFT JOIN app.UserPreference AS p ON p.UserId = u.UserId;
END;
GO
