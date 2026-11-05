-- 061_todo_recurrence.sql — recurring to-dos (ADR-0059).
-- app.TodoRecurrence holds at most one rule per to-do, which makes that to-do a series. A to-do
-- with no rule does not repeat, so every existing to-do is unchanged. Occurrences are worked out
-- when read, never stored ahead; app.TodoOccurrence holds a row only for an occurrence someone
-- changed (done, moved or skipped), keyed on the start the rule generated for it.
-- Weekdays is a bitmask, Monday = 1 up to Sunday = 64; Weekday is 1 (Monday) to 7 (Sunday);
-- Ordinal -1 is the last one in the month. A to-do's dates are calendar days, so an hourly rule
-- keeps its wall-clock start time here. Each CHECK names its NULLs, since a NULL would pass it.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.TodoRecurrence', N'U') IS NULL
BEGIN
    CREATE TABLE app.TodoRecurrence (
        TodoItemId   INT NOT NULL,
        RepeatUnit   NVARCHAR(10) NOT NULL,
        RepeatEvery  SMALLINT NOT NULL,
        StartTime    TIME(0) NULL,
        Weekdays     TINYINT NULL,
        MonthMode    NVARCHAR(12) NULL,
        Ordinal      SMALLINT NULL,
        [Weekday]    TINYINT NULL,
        EndsOn       DATE NULL,
        EndsAfter    SMALLINT NULL,
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_TodoRecurrence_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        CONSTRAINT PK_TodoRecurrence PRIMARY KEY (TodoItemId),
        CONSTRAINT FK_TodoRecurrence_TodoItem_TodoItemId FOREIGN KEY (TodoItemId)
            REFERENCES app.TodoItem (TodoItemId),
        CONSTRAINT CK_TodoRecurrence_RepeatUnit
            CHECK (RepeatUnit IN (N'Hour', N'Day', N'Week', N'Month')),
        CONSTRAINT CK_TodoRecurrence_RepeatEvery CHECK (RepeatEvery BETWEEN 1 AND 999),
        CONSTRAINT CK_TodoRecurrence_StartTime
            CHECK ((RepeatUnit = N'Hour' AND StartTime IS NOT NULL)
                OR (RepeatUnit <> N'Hour' AND StartTime IS NULL)),
        CONSTRAINT CK_TodoRecurrence_Weekdays
            CHECK ((RepeatUnit = N'Week' AND Weekdays IS NOT NULL AND Weekdays BETWEEN 1 AND 127)
                OR (RepeatUnit <> N'Week' AND Weekdays IS NULL)),
        CONSTRAINT CK_TodoRecurrence_MonthMode
            CHECK ((RepeatUnit = N'Month' AND MonthMode IS NOT NULL
                    AND MonthMode IN (N'DayOfMonth', N'NthWeekday', N'LastDay'))
                OR (RepeatUnit <> N'Month' AND MonthMode IS NULL)),
        CONSTRAINT CK_TodoRecurrence_NthWeekday
            CHECK ((ISNULL(MonthMode, N'') = N'NthWeekday'
                    AND Ordinal IS NOT NULL AND Ordinal IN (1, 2, 3, 4, -1)
                    AND [Weekday] IS NOT NULL AND [Weekday] BETWEEN 1 AND 7)
                OR (ISNULL(MonthMode, N'') <> N'NthWeekday' AND Ordinal IS NULL AND [Weekday] IS NULL)),
        CONSTRAINT CK_TodoRecurrence_OneEnding CHECK (EndsOn IS NULL OR EndsAfter IS NULL),
        CONSTRAINT CK_TodoRecurrence_EndsAfter CHECK (EndsAfter BETWEEN 1 AND 999)
    );
END;
GO

IF OBJECT_ID(N'app.TodoOccurrence', N'U') IS NULL
BEGIN
    CREATE TABLE app.TodoOccurrence (
        TodoOccurrenceId INT IDENTITY(1, 1) NOT NULL,
        TodoItemId       INT NOT NULL,
        OccursAt         DATETIME2(0) NOT NULL,
        [Status]         NVARCHAR(255) NULL,
        MovedTo          DATETIME2(0) NULL,
        IsSkipped        BIT NOT NULL CONSTRAINT DF_TodoOccurrence_IsSkipped DEFAULT 0,
        CreatedAtUtc     DATETIME2 NOT NULL CONSTRAINT DF_TodoOccurrence_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy        INT NOT NULL,
        UpdatedAtUtc     DATETIME2 NULL,
        UpdatedBy        INT NULL,
        RowVer           ROWVERSION,
        CONSTRAINT PK_TodoOccurrence PRIMARY KEY (TodoOccurrenceId),
        CONSTRAINT UQ_TodoOccurrence_TodoItemId_OccursAt UNIQUE (TodoItemId, OccursAt),
        CONSTRAINT FK_TodoOccurrence_TodoRecurrence_TodoItemId FOREIGN KEY (TodoItemId)
            REFERENCES app.TodoRecurrence (TodoItemId),
        CONSTRAINT CK_TodoOccurrence_Changed
            CHECK ([Status] IS NOT NULL OR MovedTo IS NOT NULL OR IsSkipped = 1),
        CONSTRAINT CK_TodoOccurrence_SkippedAlone
            CHECK (IsSkipped = 0 OR ([Status] IS NULL AND MovedTo IS NULL))
    );
    CREATE INDEX IX_TodoOccurrence_TodoItemId_MovedTo ON app.TodoOccurrence (TodoItemId, MovedTo)
        WHERE MovedTo IS NOT NULL;
END;
GO
