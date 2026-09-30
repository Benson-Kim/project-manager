-- usp_DailyActivity_GetById — fetch one active app.DailyActivity row; THROW 50001 when absent/soft-deleted.
-- Entity app.DailyActivity (source: tblDailyActivityList). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivity_GetById
    @DailyActivityId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.DailyActivity WHERE DailyActivityId = @DailyActivityId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:DailyActivity not found', 1;

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
