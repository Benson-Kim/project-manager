-- usp_DailyActivity_GetById — fetch one active app.DailyActivity row; THROW 50001 when absent/soft-deleted.
-- Actor project-scope: @ActorUserId must be an assignee of the owning project (FORBIDDEN_ROW 50003).
-- Admin bypass: @ActorRole = N'Admin' skips the project-scope check.
-- DailyActivity rows without a ProjectId are personal/global; the scope check is skipped for those.
-- Entity app.DailyActivity (source: tblDailyActivityList). Module: daily-activities (#19).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivity_GetById
    @DailyActivityId INT,
    @ActorUserId     INT,
    @ActorRole       NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.DailyActivity WHERE DailyActivityId = @DailyActivityId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:DailyActivity not found', 1;

    -- Project-scope check: skip when global (ProjectId IS NULL) or actor is Admin.
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND EXISTS (SELECT 1 FROM app.DailyActivity WHERE DailyActivityId = @DailyActivityId AND ProjectId IS NOT NULL AND IsDeleted = 0)
       AND NOT EXISTS (
           SELECT 1 FROM app.DailyActivity da
           JOIN app.ProjectAssignee pa ON pa.ProjectId = da.ProjectId AND pa.UserId = @ActorUserId
                                      AND pa.IsDeleted = 0
           WHERE da.DailyActivityId = @DailyActivityId AND da.IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

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
