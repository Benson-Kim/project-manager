-- usp_TodoOccurrence_Set — changes one occurrence of a repeating to-do (ADR-0059): gives it a status,
-- moves it or skips it. @OccursAt is the start the rule generated for it, the row's key. Clearing all
-- three deletes the row, so the occurrence is as the rule makes it again (an empty result).
-- The row has its own RowVer (NULL while it has no row): the series' RowVer never moves here, so an
-- open series form stays valid. The database cannot tell whether the rule generates @OccursAt
-- (occurrences are worked out in the app), so the app applies only rows its expansion produces.
-- Locks the to-do, then the rule, then the occurrence (the order usp_TodoRecurrence_Set/_Clear take),
-- the last two WITH (UPDLOCK, HOLDLOCK), so two first writes to one occurrence queue instead of
-- racing the UNIQUE key.
-- THROW 50001 NOT_FOUND     : the to-do does not exist or is soft-deleted.
-- THROW 50002 CONFLICT      : the row changed, was added, or went with a change of pattern.
-- THROW 50003 FORBIDDEN_ROW : to-do access rule (dbo.usp_TodoItem_AssertAccess, ADR-0021).
-- THROW 50004 VALIDATION    : the to-do does not repeat, @OccursAt is outside the series, a skipped
--   occurrence with a status or a move, or a status not in the 'todo-item.status' list.
-- Module: todo-items.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoOccurrence_Set
    @TodoItemId  INT,
    @OccursAt    DATETIME2(0),
    @Status      NVARCHAR(255) = NULL,
    @MovedTo     DATETIME2(0)  = NULL,
    @IsSkipped   BIT           = 0,
    @RowVer      BIGINT        = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_TodoItem_AssertAccess
         @TodoItemId = @TodoItemId, @ActorUserId = @ActorUserId, @MinLevel = N'Contributor', @Permission = N'todo-items:update';

    SET @IsSkipped = ISNULL(@IsSkipped, 0);
    IF @MovedTo = @OccursAt SET @MovedTo = NULL;
    IF @OccursAt IS NULL
        THROW 50004, N'VALIDATION:Choose an occurrence', 1;
    IF @IsSkipped = 1 AND (@Status IS NOT NULL OR @MovedTo IS NOT NULL)
        THROW 50004, N'VALIDATION:A skipped occurrence has no status and is not moved', 1;

    BEGIN TRAN;

    DECLARE @StartDate DATETIME2;
    SELECT @StartDate = StartDate FROM app.TodoItem WITH (HOLDLOCK)
    WHERE TodoItemId = @TodoItemId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:TodoItem not found', 1;

    DECLARE @EndsOn DATE;
    SELECT @EndsOn = EndsOn FROM app.TodoRecurrence WITH (UPDLOCK, HOLDLOCK)
    WHERE TodoItemId = @TodoItemId;
    IF @@ROWCOUNT = 0
        THROW 50004, N'VALIDATION:This to-do does not repeat', 1;
    IF @StartDate IS NULL
       OR @OccursAt < CAST(@StartDate AS DATE)
       OR @OccursAt >= DATEADD(DAY, 1, @EndsOn)
        THROW 50004, N'VALIDATION:That date is not in this series', 1;

    DECLARE @Id INT, @CurrentRowVer BIGINT, @CurrentStatus NVARCHAR(255);
    SELECT @Id = TodoOccurrenceId, @CurrentRowVer = CAST(RowVer AS BIGINT), @CurrentStatus = [Status]
    FROM app.TodoOccurrence WITH (UPDLOCK, HOLDLOCK)
    WHERE TodoItemId = @TodoItemId AND OccursAt = @OccursAt;

    IF (@Id IS NULL AND @RowVer IS NOT NULL)
       OR (@Id IS NOT NULL AND (@RowVer IS NULL OR @RowVer <> @CurrentRowVer))
        THROW 50002, N'CONFLICT:This occurrence was modified by someone else', 1;

    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'todo-item.status', @Label = @Status OUTPUT,
         @CurrentLabel = @CurrentStatus;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TodoOccurrenceId, TodoItemId, OccursAt, [Status], MovedTo, IsSkipped
         FROM app.TodoOccurrence WHERE TodoOccurrenceId = @Id
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    IF @Status IS NULL AND @MovedTo IS NULL AND @IsSkipped = 0
    BEGIN
        IF @Id IS NOT NULL
        BEGIN
            DELETE FROM app.TodoOccurrence WHERE TodoOccurrenceId = @Id;
            INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
            VALUES (@ActorUserId, N'Delete', N'app.TodoOccurrence', CAST(@Id AS NVARCHAR(64)), @Before);
        END
    END
    ELSE
    BEGIN
        IF @Id IS NULL
        BEGIN
            INSERT INTO app.TodoOccurrence (TodoItemId, OccursAt, [Status], MovedTo, IsSkipped, CreatedBy)
            VALUES (@TodoItemId, @OccursAt, @Status, @MovedTo, @IsSkipped, @ActorUserId);
            SET @Id = SCOPE_IDENTITY();
        END
        ELSE
            UPDATE app.TodoOccurrence SET
                [Status] = @Status, MovedTo = @MovedTo, IsSkipped = @IsSkipped,
                UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
            WHERE TodoOccurrenceId = @Id;

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
        VALUES (@ActorUserId, CASE WHEN @Before IS NULL THEN N'Create' ELSE N'Update' END,
                N'app.TodoOccurrence', CAST(@Id AS NVARCHAR(64)), @Before,
                (SELECT TodoOccurrenceId, TodoItemId, OccursAt, [Status], MovedTo, IsSkipped
                 FROM app.TodoOccurrence WHERE TodoOccurrenceId = @Id
                 FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
    END

    COMMIT;

    SELECT TodoOccurrenceId, TodoItemId, OccursAt, [Status], MovedTo, IsSkipped,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.TodoOccurrence
    WHERE TodoItemId = @TodoItemId AND OccursAt = @OccursAt;
END;
GO
