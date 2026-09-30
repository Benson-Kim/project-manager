-- usp_TodoItem_Reorder — move one TodoItem to a new position within its project scope.
-- Req 13.2: "line items orderable in any order."
-- Strategy: set the target item's SortKey to @NewSortKey; bump all other non-deleted
-- items in the same project (or NULL-project scope) that share the same SortKey up by 1
-- first (gap-opening). Audits both the before and after state of the moved row.
-- THROW 50001 NOT_FOUND     : item does not exist or is soft-deleted.
-- THROW 50002 CONFLICT      : RowVer mismatch (atomic — checked in WHERE clause).
-- THROW 50003 FORBIDDEN_ROW : actor is not the item creator nor Admin/ProjectManager.
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

    -- Row-level auth: actor must be the creator OR hold Admin/ProjectManager role.
    IF NOT EXISTS (
        SELECT 1 FROM app.TodoItem ti
        WHERE  ti.TodoItemId = @TodoItemId
          AND  ti.IsDeleted  = 0
          AND  (
                   ti.CreatedBy = @ActorUserId
                   OR EXISTS (
                       SELECT 1 FROM auth.[User] u
                       WHERE  u.UserId = @ActorUserId
                         AND  u.RoleId IN (
                                  SELECT RoleId FROM auth.[Role]
                                  WHERE  Name IN (N'Admin', N'ProjectManager')
                              )
                   )
               )
    )
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:TodoItem not found', 1;
        THROW 50003, N'FORBIDDEN_ROW:You do not have access to this record', 1;
    END

    DECLARE @ProjectId INT =
        (SELECT ProjectId FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND IsDeleted = 0);

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TodoItemId, ProjectId, [SortKey]
         FROM app.TodoItem WHERE TodoItemId = @TodoItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Open a gap at the target position: bump all items in the same scope.
    UPDATE app.TodoItem
    SET    [SortKey]    = [SortKey] + 1,
           UpdatedAtUtc = SYSUTCDATETIME(),
           UpdatedBy    = @ActorUserId
    WHERE  IsDeleted    = 0
      AND  TodoItemId  <> @TodoItemId
      AND  [SortKey]   >= @NewSortKey
      AND  ((@ProjectId IS NULL AND ProjectId IS NULL) OR ProjectId = @ProjectId);

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
