-- usp_DailyActivity_AssertAccess — guard for procs that reference a daily activity by id from
-- another entity (to-dos linked to or built from an activity), ADR-0021: the activity must exist
-- and its project (or the project-less shared space) must grant the actor @MinLevel.
-- THROW 50001 NOT_FOUND when the activity is absent or deleted; 50003 FORBIDDEN_ROW otherwise.
-- Module: security-fixes (S1, docs/security/IDOR-getbyid-procs.md).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivity_AssertAccess
    @DailyActivityId INT,
    @ActorUserId     INT,
    @MinLevel        NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ProjectId INT;
    SELECT @ProjectId = ProjectId
    FROM app.DailyActivity
    WHERE DailyActivityId = @DailyActivityId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:DailyActivity not found', 1;

    EXEC dbo.usp_Project_AssertAccess
        @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
        @MinLevel = @MinLevel, @AllowProjectless = 1;
END;
GO
