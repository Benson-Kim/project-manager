-- usp_LoginAttempt_Record — atomically increment the fixed-window per-IP
-- counter and report whether this attempt is allowed (STANDARDS §4: 5/min/IP).
-- Purges windows older than one hour so the table stays tiny. Module:
-- auth-and-rbac (#4).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_LoginAttempt_Record
    @IpAddress NVARCHAR(45),
    @Limit     INT = 5
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @WindowStart DATETIME2(0) =
        DATEADD(MINUTE, DATEDIFF(MINUTE, 0, SYSUTCDATETIME()), 0);

    BEGIN TRAN;

    UPDATE auth.LoginAttempt WITH (UPDLOCK, HOLDLOCK)
    SET AttemptCount = AttemptCount + 1
    WHERE IpAddress = @IpAddress AND WindowStartUtc = @WindowStart;

    IF @@ROWCOUNT = 0
        INSERT INTO auth.LoginAttempt (IpAddress, WindowStartUtc, AttemptCount)
        VALUES (@IpAddress, @WindowStart, 1);

    DELETE FROM auth.LoginAttempt
    WHERE WindowStartUtc < DATEADD(HOUR, -1, SYSUTCDATETIME());

    COMMIT;

    DECLARE @Count INT =
        (SELECT AttemptCount FROM auth.LoginAttempt
         WHERE IpAddress = @IpAddress AND WindowStartUtc = @WindowStart);

    SELECT CAST(CASE WHEN @Count <= @Limit THEN 1 ELSE 0 END AS BIT) AS Allowed,
           @Count AS AttemptCount,
           CASE WHEN @Count <= @Limit THEN 0
                ELSE DATEDIFF(SECOND, SYSUTCDATETIME(), DATEADD(MINUTE, 1, @WindowStart))
           END AS RetryAfterSeconds;
END;
GO
