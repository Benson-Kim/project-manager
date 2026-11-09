-- usp_Todo_FollowBoardCards — keep a board's card to-dos in step with their cards.
-- A live to-do whose card is deleted is soft-deleted with it (the card's to-do goes with the
--   card), so its alerts leave every read (dbo.usp_Todo_GetDueAlerts filters t.IsDeleted = 0).
-- A live to-do whose card is live takes the board's project, NULL when the board is unlinked.
-- Internal: called by dbo.usp_Board_SetProject and dbo.usp_BoardCard_Delete inside their
--   transaction, after they lock the board and assert access, so it asserts nothing itself.
-- Audits one row per to-do changed.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Todo_FollowBoardCards
    @BoardId     INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT = (SELECT ProjectId FROM app.Board WHERE BoardId = @BoardId);

    DECLARE @Changed TABLE (
        TodoItemId INT NOT NULL PRIMARY KEY,
        Retire     BIT NOT NULL,
        BeforeJson NVARCHAR(MAX) NOT NULL
    );

    INSERT INTO @Changed (TodoItemId, Retire, BeforeJson)
    SELECT t.TodoItemId,
           c.IsDeleted,
           (SELECT t.TodoItemId, t.ProjectId, t.BoardCardId, t.TodoItem, t.DueDate, t.Status
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
    FROM app.TodoItem t
    JOIN app.BoardCard c ON c.BoardCardId = t.BoardCardId
    WHERE c.BoardId = @BoardId AND t.IsDeleted = 0
      AND (c.IsDeleted = 1 OR EXISTS (SELECT t.ProjectId EXCEPT SELECT @ProjectId));

    IF NOT EXISTS (SELECT 1 FROM @Changed)
        RETURN;

    UPDATE t SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    FROM app.TodoItem t
    JOIN @Changed x ON x.TodoItemId = t.TodoItemId AND x.Retire = 1;

    UPDATE t SET
        ProjectId    = @ProjectId,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    FROM app.TodoItem t
    JOIN @Changed x ON x.TodoItemId = t.TodoItemId AND x.Retire = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    SELECT @ActorUserId,
           CASE WHEN x.Retire = 1 THEN N'Delete' ELSE N'FollowBoard' END,
           N'app.TodoItem',
           CAST(x.TodoItemId AS NVARCHAR(64)),
           x.BeforeJson,
           CASE WHEN x.Retire = 0 THEN
               (SELECT t.TodoItemId, t.ProjectId, t.BoardCardId, t.TodoItem, t.DueDate, t.Status
                FROM app.TodoItem t WHERE t.TodoItemId = x.TodoItemId
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
           END
    FROM @Changed x;
END;
GO
