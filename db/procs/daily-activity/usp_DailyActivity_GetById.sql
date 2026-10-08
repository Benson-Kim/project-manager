-- usp_DailyActivity_GetById — fetch one active app.DailyActivity row; THROW 50001 when absent/soft-deleted.
-- Row-level access via dbo.usp_Project_AssertAccess: NOT_FOUND (50001) vs FORBIDDEN_ROW (50003);
--   Admin bypass; project-less rows are global (allowed).
-- Entity app.DailyActivity (source: tblDailyActivityList). Module: daily-activities (#19).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivity_GetById
    @DailyActivityId INT,
    @ActorUserId     INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.DailyActivity WHERE DailyActivityId = @DailyActivityId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:DailyActivity not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 1;

    SELECT DailyActivityId,
           [ProjectId],
           [ActivityStatusId],
           [Requester],
           [Task],
           [MyActivity],
           [ActivityDate],
           [Comments],
           [RequestDate],
           [Status],
           [CompleteDate],
           [ContactMethod],
           [TimeSpent],
           [AssignedTo],
           [TaskType],
           [Progress],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.DailyActivity
    WHERE DailyActivityId = @DailyActivityId AND IsDeleted = 0;
END;
GO
