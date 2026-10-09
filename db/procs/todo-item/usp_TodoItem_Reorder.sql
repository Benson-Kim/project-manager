-- usp_TodoItem_Reorder — move one TodoItem to a new position within its project scope.
-- Req 13.2: "line items orderable in any order."
-- Strategy: shift the intervening range toward the item's old position, then
-- assign the requested key. This supports both upward and downward moves without
-- leaving the moved item on the same side of its target. Audits the moved row.
-- THROW 50001 NOT_FOUND     : item does not exist or is soft-deleted.
-- THROW 50002 CONFLICT      : RowVer mismatch (atomic — checked in WHERE clause).
-- THROW 50003 FORBIDDEN_ROW : to-do access rule (dbo.usp_TodoItem_AssertAccess, ADR-0021).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_Reorder
    @TodoItemId  INT,
    @NewSortKey  INT,
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_TodoItem_AssertAccess
         @TodoItemId = @TodoItemId, @ActorUserId = @ActorUserId, @MinLevel = N'Contributor';

    DECLARE @ProjectId INT;
    DECLARE @OldSortKey INT;
    SELECT @ProjectId = ProjectId,
           @OldSortKey = [SortKey]
    FROM app.TodoItem
    WHERE TodoItemId = @TodoItemId AND IsDeleted = 0;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TodoItemId, ProjectId, [SortKey]
         FROM app.TodoItem WHERE TodoItemId = @TodoItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Moving up: push the intervening items down one position.
    IF @NewSortKey < @OldSortKey
    BEGIN
        UPDATE app.TodoItem
        SET    [SortKey]    = [SortKey] + 1,
               UpdatedAtUtc = SYSUTCDATETIME(),
               UpdatedBy    = @ActorUserId
        WHERE  IsDeleted    = 0
          AND  TodoItemId  <> @TodoItemId
          AND  [SortKey]   >= @NewSortKey
          AND  [SortKey]   < @OldSortKey
          AND  ((@ProjectId IS NULL AND ProjectId IS NULL) OR ProjectId = @ProjectId);
    END;

    -- Moving down: pull the intervening items up one position.
    IF @NewSortKey > @OldSortKey
    BEGIN
        UPDATE app.TodoItem
        SET    [SortKey]    = [SortKey] - 1,
               UpdatedAtUtc = SYSUTCDATETIME(),
               UpdatedBy    = @ActorUserId
        WHERE  IsDeleted    = 0
          AND  TodoItemId  <> @TodoItemId
          AND  [SortKey]   > @OldSortKey
          AND  [SortKey]   <= @NewSortKey
          AND  ((@ProjectId IS NULL AND ProjectId IS NULL) OR ProjectId = @ProjectId);
    END;

    -- Atomic RowVer check: move the item only when RowVer matches.
    UPDATE app.TodoItem
    SET    [SortKey]    = @NewSortKey,
           UpdatedAtUtc = SYSUTCDATETIME(),
           UpdatedBy    = @ActorUserId
    WHERE  TodoItemId   = @TodoItemId
      AND  IsDeleted    = 0
      AND  CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:TodoItem not found', 1;
        THROW 50002, N'CONFLICT:TodoItem was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Reorder', N'app.TodoItem', CAST(@TodoItemId AS NVARCHAR(64)), @Before,
            (SELECT TodoItemId, ProjectId, [SortKey]
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
           [Notes],
           [SortKey],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.TodoItem
    WHERE TodoItemId = @TodoItemId;
END;
GO
