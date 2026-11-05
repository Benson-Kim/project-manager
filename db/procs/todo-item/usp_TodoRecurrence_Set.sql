-- usp_TodoRecurrence_Set — sets how a to-do repeats (ADR-0059), creating or replacing its one rule.
-- The rule has no RowVer of its own: the series' TodoItem RowVer is the one token, so this checks it
-- and touches the to-do, and a to-do form opened before the change conflicts.
-- Changing the pattern (anything but EndsOn/EndsAfter) deletes the rows of future occurrences, as
-- Outlook does; the form says so first. "Future" is the user's wall clock, @LocalNow, used when
-- within 14 hours of UTC, else UTC (as usp_Todo_Snooze). The deleted rows go into the audit.
-- THROW 50001 NOT_FOUND     : the to-do does not exist or is soft-deleted.
-- THROW 50002 CONFLICT      : RowVer mismatch.
-- THROW 50003 FORBIDDEN_ROW : to-do access rule (dbo.usp_TodoItem_AssertAccess, ADR-0021).
-- THROW 50004 VALIDATION    : a rule the CHECKs on app.TodoRecurrence would refuse, a to-do without a
--   StartDate (the anchor), or an EndsOn before it. The CHECKs stay the backstop.
-- Module: todo-items.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoRecurrence_Set
    @TodoItemId  INT,
    @RepeatUnit  NVARCHAR(10),
    @RepeatEvery SMALLINT,
    @StartTime   TIME(0)      = NULL,
    @Weekdays    TINYINT      = NULL,
    @MonthMode   NVARCHAR(12) = NULL,
    @Ordinal     SMALLINT     = NULL,
    @Weekday     TINYINT      = NULL,
    @EndsOn      DATE         = NULL,
    @EndsAfter   SMALLINT     = NULL,
    @RowVer      BIGINT,
    @ActorUserId INT,
    @LocalNow    DATETIME2(0) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_TodoItem_AssertAccess
         @TodoItemId = @TodoItemId, @ActorUserId = @ActorUserId, @MinLevel = N'Contributor', @Permission = N'todo-items:update';

    IF @RepeatUnit IS NULL OR @RepeatUnit NOT IN (N'Hour', N'Day', N'Week', N'Month')
        THROW 50004, N'VALIDATION:Choose how often it repeats', 1;
    IF @RepeatEvery IS NULL OR @RepeatEvery NOT BETWEEN 1 AND 999
        THROW 50004, N'VALIDATION:Repeat every 1 to 999', 1;
    IF (@RepeatUnit = N'Hour' AND @StartTime IS NULL) OR (@RepeatUnit <> N'Hour' AND @StartTime IS NOT NULL)
        THROW 50004, N'VALIDATION:An hourly repeat needs a start time, and only it has one', 1;
    IF (@RepeatUnit = N'Week' AND (@Weekdays IS NULL OR @Weekdays NOT BETWEEN 1 AND 127))
       OR (@RepeatUnit <> N'Week' AND @Weekdays IS NOT NULL)
        THROW 50004, N'VALIDATION:A weekly repeat needs at least one day, and only it has days', 1;
    IF (@RepeatUnit = N'Month'
        AND (@MonthMode IS NULL OR @MonthMode NOT IN (N'DayOfMonth', N'NthWeekday', N'LastDay')))
       OR (@RepeatUnit <> N'Month' AND @MonthMode IS NOT NULL)
        THROW 50004, N'VALIDATION:A monthly repeat needs a pattern, and only it has one', 1;
    IF (ISNULL(@MonthMode, N'') = N'NthWeekday'
        AND (@Ordinal IS NULL OR @Ordinal NOT IN (1, 2, 3, 4, -1)
             OR @Weekday IS NULL OR @Weekday NOT BETWEEN 1 AND 7))
       OR (ISNULL(@MonthMode, N'') <> N'NthWeekday' AND (@Ordinal IS NOT NULL OR @Weekday IS NOT NULL))
        THROW 50004, N'VALIDATION:Choose which weekday of the month', 1;
    IF @EndsOn IS NOT NULL AND @EndsAfter IS NOT NULL
        THROW 50004, N'VALIDATION:A repeat ends on a date or after a number of times, not both', 1;
    IF @EndsAfter NOT BETWEEN 1 AND 999
        THROW 50004, N'VALIDATION:End after 1 to 999 times', 1;

    DECLARE @StartDate DATETIME2;
    SELECT @StartDate = StartDate FROM app.TodoItem WHERE TodoItemId = @TodoItemId;
    IF @StartDate IS NULL
        THROW 50004, N'VALIDATION:A repeating to-do needs a start date', 1;
    IF @EndsOn < CAST(@StartDate AS DATE)
        THROW 50004, N'VALIDATION:The repeat cannot end before the to-do starts', 1;

    DECLARE @Utc DATETIME2(0) = SYSUTCDATETIME();
    DECLARE @Now DATETIME2(0) =
        CASE WHEN @LocalNow BETWEEN DATEADD(HOUR, -14, @Utc) AND DATEADD(HOUR, 14, @Utc)
             THEN @LocalNow ELSE @Utc END;

    BEGIN TRAN;

    -- The RowVer check comes first and holds the to-do's row, so rule writes on one series queue here.
    UPDATE app.TodoItem SET UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE TodoItemId = @TodoItemId
      AND IsDeleted  = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:TodoItem not found', 1;
        THROW 50002, N'CONFLICT:TodoItem was modified by someone else', 1;
    END

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TodoItemId, RepeatUnit, RepeatEvery, StartTime, Weekdays, MonthMode, Ordinal, [Weekday],
                EndsOn, EndsAfter
         FROM app.TodoRecurrence WITH (UPDLOCK, HOLDLOCK) WHERE TodoItemId = @TodoItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- NULL-safe: EXCEPT treats two NULLs as equal.
    DECLARE @PatternChanged BIT = CASE WHEN EXISTS (
        SELECT RepeatUnit, RepeatEvery, StartTime, Weekdays, MonthMode, Ordinal, [Weekday]
        FROM app.TodoRecurrence WHERE TodoItemId = @TodoItemId
        EXCEPT
        SELECT @RepeatUnit, @RepeatEvery, @StartTime, @Weekdays, @MonthMode, @Ordinal, @Weekday
    ) THEN 1 ELSE 0 END;

    IF @Before IS NULL
        INSERT INTO app.TodoRecurrence
            (TodoItemId, RepeatUnit, RepeatEvery, StartTime, Weekdays, MonthMode, Ordinal, [Weekday],
             EndsOn, EndsAfter, CreatedBy)
        VALUES
            (@TodoItemId, @RepeatUnit, @RepeatEvery, @StartTime, @Weekdays, @MonthMode, @Ordinal, @Weekday,
             @EndsOn, @EndsAfter, @ActorUserId);
    ELSE
        UPDATE app.TodoRecurrence SET
            RepeatUnit = @RepeatUnit, RepeatEvery = @RepeatEvery, StartTime = @StartTime,
            Weekdays = @Weekdays, MonthMode = @MonthMode, Ordinal = @Ordinal, [Weekday] = @Weekday,
            EndsOn = @EndsOn, EndsAfter = @EndsAfter,
            UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE TodoItemId = @TodoItemId;

    IF @PatternChanged = 1
    BEGIN
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

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, CASE WHEN @Before IS NULL THEN N'Create' ELSE N'Update' END,
            N'app.TodoRecurrence', CAST(@TodoItemId AS NVARCHAR(64)), @Before,
            (SELECT TodoItemId, RepeatUnit, RepeatEvery, StartTime, Weekdays, MonthMode, Ordinal, [Weekday],
                    EndsOn, EndsAfter
             FROM app.TodoRecurrence WHERE TodoItemId = @TodoItemId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT r.TodoItemId, r.RepeatUnit, r.RepeatEvery, r.StartTime, r.Weekdays, r.MonthMode, r.Ordinal,
           r.[Weekday], r.EndsOn, r.EndsAfter, CAST(t.RowVer AS BIGINT) AS RowVer
    FROM app.TodoRecurrence r
    JOIN app.TodoItem t ON t.TodoItemId = r.TodoItemId
    WHERE r.TodoItemId = @TodoItemId;
END;
GO
