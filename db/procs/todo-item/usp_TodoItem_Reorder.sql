-- usp_TodoItem_Reorder — move one TodoItem to a new position within its project scope.
-- Req 13.2: "line items orderable in any order."
-- Strategy: set the target item's SortKey to @NewSortKey; bump all other non-deleted
-- items in the same project (or NULL-project scope) that share the same SortKey up by 1
-- first (gap-opening). Audits both the before and after state of the moved row.
-- THROW 50001 when the item does not exist or is soft-deleted.
-- THROW 50002 when @RowVer does not match (optimistic concurrency).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_Reorder
    @TodoItemId INT,
    @NewSortKey INT,
    @RowVer     BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer  BIGINT;
    DECLARE @ProjectId   INT;

    SELECT @CurrentVer = CAST(RowVer AS BIGINT),
           @ProjectId  = ProjectId
    FROM app.TodoItem
    WHERE TodoItemId = @TodoItemId AND IsDeleted = 0;

    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:TodoItem not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:TodoItem was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TodoItemId, ProjectId, [SortKey]
         FROM app.TodoItem WHERE TodoItemId = @TodoItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Open a gap at the target position: bump all items in the same scope with SortKey >= @NewSortKey.
    UPDATE app.TodoItem
    SET    [SortKey]     = [SortKey] + 1,
           UpdatedAtUtc  = SYSUTCDATETIME(),
           UpdatedBy     = @ActorUserId
    WHERE  IsDeleted = 0
      AND  TodoItemId <> @TodoItemId
      AND  [SortKey] >= @NewSortKey
      AND  ((@ProjectId IS NULL AND ProjectId IS NULL) OR ProjectId = @ProjectId);

    -- Place the moved item at the exact position.
    UPDATE app.TodoItem
    SET    [SortKey]     = @NewSortKey,
           UpdatedAtUtc  = SYSUTCDATETIME(),
           UpdatedBy     = @ActorUserId
    WHERE  TodoItemId = @TodoItemId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Reorder', N'app.TodoItem', CAST(@TodoItemId AS NVARCHAR(64)), @Before,
            (SELECT TodoItemId, ProjectId, [SortKey]
             FROM app.TodoItem WHERE TodoItemId = @TodoItemId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    -- Return the updated row so the client can refresh its RowVer.
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
