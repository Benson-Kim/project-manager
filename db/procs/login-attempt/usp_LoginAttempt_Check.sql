-- usp_LoginAttempt_Check — read-only fixed-window rate-limit check
-- (STANDARDS §4: login 5/min/IP). Returns Allowed + RetryAfterSeconds; does
-- not increment (usp_LoginAttempt_Record does). Module: auth-and-rbac (#4).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_LoginAttempt_Check
    @IpAddress NVARCHAR(45),
    @Limit     INT = 5
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WindowStart DATETIME2(0) =
        DATEADD(MINUTE, DATEDIFF(MINUTE, 0, SYSUTCDATETIME()), 0);
    DECLARE @Count INT = ISNULL(
        (SELECT AttemptCount FROM auth.LoginAttempt
         WHERE IpAddress = @IpAddress AND WindowStartUtc = @WindowStart), 0);

    SELECT CAST(CASE WHEN @Count < @Limit THEN 1 ELSE 0 END AS BIT) AS Allowed,
           @Count AS AttemptCount,
           CASE WHEN @Count < @Limit THEN 0
                ELSE DATEDIFF(SECOND, SYSUTCDATETIME(), DATEADD(MINUTE, 1, @WindowStart))
           END AS RetryAfterSeconds;
END;
GO
