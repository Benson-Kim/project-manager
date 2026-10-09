-- usp_DailyActivity_Create — insert one app.DailyActivity row; audits in-transaction; returns the new row.
-- Row-level access: the target @ProjectId must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass; project-less rows allowed).
-- Dropdown values must be live options of their lists (ADR-0022, VALIDATION 50004): ActivityStatusId
--   ('daily-activity.status', by id), ContactMethod and TaskType (by label, stored as listed).
-- Returns ActivityStatus, the status option's label (live or retired), with the row.
-- Entity app.DailyActivity (source: tblDailyActivityList). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivity_Create
    @ProjectId INT = NULL,
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
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'daily-activities:create', @AllowProjectless = 1;

    EXEC dbo.usp_LookupList_AssertOption
         @ListKey = N'daily-activity.status', @LookupOptionId = @ActivityStatusId;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'daily-activity.contact-method', @Label = @ContactMethod OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'daily-activity.task-type', @Label = @TaskType OUTPUT;

    BEGIN TRAN;

    INSERT INTO app.DailyActivity ([ProjectId], [ActivityStatusId], [Requester], [Task], [MyActivity], [ActivityDate], [Comments], [RequestDate], [Status], [CompleteDate], [ContactMethod], [TimeSpent], [AssignedTo], [TaskType], [Progress], CreatedBy)
    VALUES (@ProjectId, @ActivityStatusId, @Requester, @Task, @MyActivity, @ActivityDate, @Comments, @RequestDate, @Status, @CompleteDate, @ContactMethod, @TimeSpent, @AssignedTo, @TaskType, @Progress, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.DailyActivity', CAST(@Id AS NVARCHAR(64)),
            (SELECT DailyActivityId, [ProjectId], [ActivityStatusId], [Requester], [Task], [MyActivity], [ActivityDate], [Comments], [RequestDate], [Status], [CompleteDate], [ContactMethod], [TimeSpent], [AssignedTo], [TaskType], [Progress]
             FROM app.DailyActivity WHERE DailyActivityId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT DailyActivityId,
           [ProjectId],
           [ActivityStatusId],
           (SELECT Label FROM app.LookupOption WHERE LookupOptionId = DailyActivity.ActivityStatusId) AS ActivityStatus,
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
    WHERE DailyActivityId = @Id;
END;
GO
