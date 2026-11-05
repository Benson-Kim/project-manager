-- usp_TodoItem_Update — full-row update with ATOMIC rowversion concurrency check (TOCTOU fix)
-- + in-transaction audit + row-level auth (FORBIDDEN_ROW).
-- THROW 50001 NOT_FOUND  : row does not exist or is soft-deleted.
-- THROW 50002 CONFLICT   : RowVer mismatch (check-then-update is atomic via WHERE clause).
-- THROW 50003 FORBIDDEN_ROW : to-do access rule (dbo.usp_TodoItem_AssertAccess, ADR-0021).
-- THROW 50004 VALIDATION : DueDate before StartDate, when either of them changes (a to-do saved
--   inverted before the rule existed can still be edited); a repeating to-do's StartDate cleared,
--   or moved after its repeat's EndsOn. @LocalNow is the user's wall clock (as in
--   usp_TodoRecurrence_Set), which decides which occurrence rows are future; UTC when absent.
-- Dropdown values (ADR-0022): Status and Priority must be live options of their lists, or unchanged (VALIDATION 50004),
--   and are stored as listed.
-- Entity app.TodoItem (source: tblTodoList). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_Update
    @TodoItemId        INT,
    @ProjectId         INT          = NULL,
    @DailyActivityId   INT          = NULL,
    @ProjectOrActivity NVARCHAR(50) = NULL,
    @TodoItem          NVARCHAR(255) = NULL,
    @StartDate         DATETIME2    = NULL,
    @DueDate           DATETIME2    = NULL,
    @Priority          NVARCHAR(255) = NULL,
    @Status            NVARCHAR(255) = NULL,
    @Assignee          NVARCHAR(255) = NULL,
    @Notes             NVARCHAR(MAX) = NULL,
    @RowVer            BIGINT,
    @ActorUserId       INT,
    @LocalNow          DATETIME2(0) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Row-level access (ADR-0021): the to-do rule, plus Contributor on the (possibly new)
    -- project and read access to a linked activity.
    EXEC dbo.usp_TodoItem_AssertAccess
         @TodoItemId = @TodoItemId, @ActorUserId = @ActorUserId, @MinLevel = N'Contributor', @Permission = N'todo-items:update';
    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'todo-items:update', @AllowProjectless = 1;
    IF @DailyActivityId IS NOT NULL
        EXEC dbo.usp_DailyActivity_AssertAccess
             @DailyActivityId = @DailyActivityId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    DECLARE @CurrentStatus NVARCHAR(255), @CurrentPriority NVARCHAR(255),
            @CurrentStart DATETIME2, @CurrentDue DATETIME2;
    SELECT @CurrentStatus = [Status], @CurrentPriority = [Priority],
           @CurrentStart = StartDate, @CurrentDue = DueDate
    FROM app.TodoItem WHERE TodoItemId = @TodoItemId;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'todo-item.status', @Label = @Status OUTPUT,
         @CurrentLabel = @CurrentStatus;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'todo-item.priority', @Label = @Priority OUTPUT,
         @CurrentLabel = @CurrentPriority;

    IF @DueDate < @StartDate
       AND (@CurrentStart IS NULL OR @CurrentDue IS NULL
            OR CAST(@StartDate AS DATE) <> CAST(@CurrentStart AS DATE)
            OR CAST(@DueDate AS DATE) <> CAST(@CurrentDue AS DATE))
        THROW 50004, N'VALIDATION:DueDate cannot be before StartDate', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TodoItemId, [ProjectId], [DailyActivityId], [ProjectOrActivity], [TodoItem],
                [StartDate], [DueDate], [Priority], [Status], [Assignee], [Notes]
         FROM app.TodoItem WHERE TodoItemId = @TodoItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic RowVer check: include RowVer in the WHERE clause.
    -- If the row was modified between our auth check and here, @@ROWCOUNT = 0.
    UPDATE app.TodoItem SET
        [ProjectId]         = @ProjectId,
        [DailyActivityId]   = @DailyActivityId,
        [ProjectOrActivity] = @ProjectOrActivity,
        [TodoItem]          = @TodoItem,
        [StartDate]         = @StartDate,
        [DueDate]           = @DueDate,
        [Priority]          = @Priority,
        [Status]            = @Status,
        [Assignee]          = NULLIF(LTRIM(RTRIM(@Assignee)), N''),
        [Notes]             = @Notes,
        UpdatedAtUtc        = SYSUTCDATETIME(),
        UpdatedBy           = @ActorUserId
    WHERE TodoItemId = @TodoItemId
      AND IsDeleted  = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:TodoItem not found', 1;
        THROW 50002, N'CONFLICT:TodoItem was modified by someone else', 1;
    END

    -- A series repeats from its StartDate (ADR-0059), so it keeps one, and moving it moves every
    -- occurrence: the rows saved for future ones go (into the audit), as a pattern change does.
    -- Rule writes move this row's RowVer first, so the rule cannot change under this check.
    DECLARE @HasRule BIT = 0, @EndsOn DATE;
    SELECT @HasRule = 1, @EndsOn = EndsOn FROM app.TodoRecurrence WHERE TodoItemId = @TodoItemId;
    IF @HasRule = 1
    BEGIN
        IF @StartDate IS NULL
            THROW 50004, N'VALIDATION:A repeating to-do needs a start date', 1;
        IF @EndsOn < CAST(@StartDate AS DATE)
            THROW 50004, N'VALIDATION:The repeat cannot end before the to-do starts', 1;
        IF @CurrentStart IS NULL OR CAST(@StartDate AS DATE) <> CAST(@CurrentStart AS DATE)
        BEGIN
            DECLARE @Utc DATETIME2(0) = SYSUTCDATETIME();
            DECLARE @Now DATETIME2(0) =
                CASE WHEN @LocalNow BETWEEN DATEADD(HOUR, -14, @Utc) AND DATEADD(HOUR, 14, @Utc)
                     THEN @LocalNow ELSE @Utc END;
            DECLARE @Gone TABLE (TodoOccurrenceId INT, OccursAt DATETIME2(0), [Status] NVARCHAR(255),
                                 MovedTo DATETIME2(0), IsSkipped BIT);
            DELETE FROM app.TodoOccurrence
            OUTPUT deleted.TodoOccurrenceId, deleted.OccursAt, deleted.[Status], deleted.MovedTo, deleted.IsSkipped
                INTO @Gone
            WHERE TodoItemId = @TodoItemId AND OccursAt >= @Now;
            IF @@ROWCOUNT > 0
                SET @Before = JSON_MODIFY(@Before, N'$.RemovedOccurrences',
                    JSON_QUERY((SELECT * FROM @Gone ORDER BY OccursAt FOR JSON PATH)));
        END
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.TodoItem', CAST(@TodoItemId AS NVARCHAR(64)), @Before,
            (SELECT TodoItemId, [ProjectId], [DailyActivityId], [ProjectOrActivity], [TodoItem],
                    [StartDate], [DueDate], [Priority], [Status], [Assignee], [Notes]
             FROM app.TodoItem WHERE TodoItemId = @TodoItemId
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
           [Assignee],
           [Notes],
           [SortKey],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.TodoItem
    WHERE TodoItemId = @TodoItemId;
END;
GO
