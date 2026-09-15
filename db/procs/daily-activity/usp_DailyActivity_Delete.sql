-- usp_DailyActivity_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.DailyActivity (source: tblDailyActivityList). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivity_Delete
    @DailyActivityId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.DailyActivity WHERE DailyActivityId = @DailyActivityId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:DailyActivity not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:DailyActivity was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT DailyActivityId, [ProjectId], [ActivityStatusId], [Requester], [Task], [MyActivity], [ActivityDate], [Comments], [RequestDate], [Status], [CompleteDate], [ContactMethod], [TimeSpent], [AssignedTo], [TaskType], [Progress]
         FROM app.DailyActivity WHERE DailyActivityId = @DailyActivityId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.DailyActivity SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE DailyActivityId = @DailyActivityId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.DailyActivity', CAST(@DailyActivityId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
