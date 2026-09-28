-- usp_Todo_BuildFromDailyActivity — create a TodoItem derived from an existing DailyActivity row
-- (req 13.1 "built from daily activity list").
-- Copies Task → TodoItem, RequestDate → StartDate, preserves ProjectId and DailyActivityId FK.
-- Status defaults to 'Not Started'; Priority and DueDate are left NULL.
-- THROW 50001 NOT_FOUND     : DailyActivity does not exist or is soft-deleted.
-- THROW 50003 FORBIDDEN_ROW : actor is not the activity creator nor Admin/ProjectManager.
-- THROW 50005 DUPLICATE     : a non-deleted TodoItem already links to this DailyActivityId.
-- Audits the creation in-transaction.  Module: todo-alerts (#20).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Todo_BuildFromDailyActivity
    @DailyActivityId INT,
    @ActorUserId     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId    INT;
    DECLARE @Task         NVARCHAR(MAX);
    DECLARE @RequestDate  DATETIME2;
    DECLARE @ActivityCreatedBy INT;

    SELECT @ProjectId          = ProjectId,
           @Task               = [Task],
           @RequestDate        = RequestDate,
           @ActivityCreatedBy  = CreatedBy
    FROM app.DailyActivity
    WHERE DailyActivityId = @DailyActivityId AND IsDeleted = 0;

    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:DailyActivity not found', 1;

    -- Row-level auth: actor must be the activity creator or Admin/PM.
    IF @ActivityCreatedBy <> @ActorUserId
    AND NOT EXISTS (
        SELECT 1 FROM auth.[User] u
        WHERE  u.UserId = @ActorUserId
          AND  u.RoleId IN (
                   SELECT RoleId FROM auth.[Role]
                   WHERE  RoleName IN (N'Admin', N'ProjectManager')
               )
    )
        THROW 50003, N'FORBIDDEN_ROW:You do not have access to this record', 1;

    -- Prevent duplicate TodoItems linked to the same DailyActivity.
    IF EXISTS (
        SELECT 1 FROM app.TodoItem
        WHERE DailyActivityId = @DailyActivityId AND IsDeleted = 0
    )
        THROW 50005, N'DUPLICATE:A to-do item already exists for this activity', 1;

    BEGIN TRAN;

    INSERT INTO app.TodoItem
        ([ProjectId], [DailyActivityId], [ProjectOrActivity], [TodoItem], [StartDate], [Status], CreatedBy)
    VALUES
        (@ProjectId, @DailyActivityId, N'Daily Activity',
         ISNULL(NULLIF(LTRIM(RTRIM(@Task)), N''), N'(no task)'),
         @RequestDate, N'Not Started', @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'BuildFromDailyActivity', N'app.TodoItem', CAST(@Id AS NVARCHAR(64)),
            (SELECT TodoItemId, [ProjectId], [DailyActivityId], [TodoItem], [Status]
             FROM app.TodoItem WHERE TodoItemId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT TodoItemId,
           [ProjectId],
           [DailyActivityId],
           [ProjectOrActivity],
           [TodoItem],
           [StartDate],
           [DueDate],
           [Priority],
           [Status],
           [Notes],
           [SortKey],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.TodoItem
    WHERE TodoItemId = @Id;
END;
GO
