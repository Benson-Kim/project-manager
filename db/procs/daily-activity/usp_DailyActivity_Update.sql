-- usp_DailyActivity_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.DailyActivity (source: tblDailyActivityList). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivity_Update
    @DailyActivityId INT,
    @ProjectId INT,
    @ActivityStatusId INT = NULL,
    @Requester NVARCHAR(255) = NULL,
    @Task NVARCHAR(MAX) = NULL,
    @MyActivity NVARCHAR(MAX) = NULL,
    @ActivityDate DATETIME2 = NULL,
    @Comments NVARCHAR(MAX) = NULL,
    @RequestDate DATETIME2 = NULL,
    @Status NVARCHAR(255) = NULL,
    @CompleteDate DATETIME2 = NULL,
    @ContactMethod NVARCHAR(255) = NULL,
    @TimeSpent INT = NULL,
    @AssignedTo NVARCHAR(255) = NULL,
    @TaskType NVARCHAR(255) = NULL,
    @Progress INT = NULL,
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
        [ProjectId] = @ProjectId,
        [ActivityStatusId] = @ActivityStatusId,
        [Requester] = @Requester,
        [Task] = @Task,
        [MyActivity] = @MyActivity,
        [ActivityDate] = @ActivityDate,
        [Comments] = @Comments,
        [RequestDate] = @RequestDate,
        -- [Status] is a legacy free-text column from tblDailyActivityList; new records use
        -- ActivityStatusId (FK). The column is intentionally excluded from UPDATE to preserve
        -- migrated Access data on first edit. It remains readable via GetById/List.
        [CompleteDate] = @CompleteDate,
        [ContactMethod] = @ContactMethod,
        [TimeSpent] = @TimeSpent,
        [AssignedTo] = @AssignedTo,
        [TaskType] = @TaskType,
        [Progress] = @Progress,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE DailyActivityId = @DailyActivityId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.DailyActivity WHERE DailyActivityId = @DailyActivityId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:DailyActivity not found', 1;
        THROW 50002, N'CONFLICT:DailyActivity was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.DailyActivity', CAST(@DailyActivityId AS NVARCHAR(64)), @Before,
            (SELECT DailyActivityId, [ProjectId], [ActivityStatusId], [Requester], [Task], [MyActivity], [ActivityDate], [Comments], [RequestDate], [Status], [CompleteDate], [ContactMethod], [TimeSpent], [AssignedTo], [TaskType], [Progress]
             FROM app.DailyActivity WHERE DailyActivityId = @DailyActivityId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

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
    WHERE DailyActivityId = @DailyActivityId;
END;
GO
