-- usp_Todo_BuildFromBoardCard — a to-do with an all-day alert on a dated Kanban card's due day.
-- Copies the card's Title → TodoItem, DueDate → DueDate and AlertDay; ProjectId is the board's.
-- A card holds at most one live to-do (migration 069): when it already has one, that one is
-- returned with Existed = 1 and nothing is written.
-- THROW 50001 NOT_FOUND     : the card does not exist, is deleted, or has no due date.
-- THROW 50003 FORBIDDEN_ROW : the card's board is unreadable, or no Contributor on its project.
-- Audits both rows in-transaction.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Todo_BuildFromBoardCard
    @BoardCardId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @BoardId INT, @ProjectId INT, @Title NVARCHAR(300), @DueDate DATE;
    SELECT @BoardId = c.BoardId, @ProjectId = b.ProjectId, @Title = c.Title, @DueDate = c.DueDate
    FROM app.BoardCard c
    JOIN app.Board b ON b.BoardId = c.BoardId AND b.IsDeleted = 0
    WHERE c.BoardCardId = @BoardCardId AND c.IsDeleted = 0;
    IF @BoardId IS NULL
        THROW 50001, N'NOT_FOUND:Card not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';
    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'todo-items:create', @AllowProjectless = 1;

    IF @DueDate IS NULL
        THROW 50001, N'NOT_FOUND:The card has no due date', 1;

    BEGIN TRAN;

    DECLARE @Id INT;
    SELECT @Id = TodoItemId FROM app.TodoItem WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardCardId = @BoardCardId AND IsDeleted = 0;

    IF @Id IS NOT NULL
    BEGIN
        COMMIT;
        SELECT @Id AS TodoItemId, CAST(1 AS BIT) AS Existed;
        RETURN;
    END;

    INSERT INTO app.TodoItem ([ProjectId], [BoardCardId], [TodoItem], [DueDate], [Status], CreatedBy)
    VALUES (@ProjectId, @BoardCardId,
            LEFT(ISNULL(NULLIF(LTRIM(RTRIM(@Title)), N''), N'(untitled card)'), 255),
            @DueDate, N'Not Started', @ActorUserId);
    SET @Id = SCOPE_IDENTITY();

    INSERT INTO app.TodoAlert ([TodoItemId], [AlertDay], [IsDismissed], CreatedBy)
    VALUES (@Id, @DueDate, 0, @ActorUserId);
    DECLARE @AlertId INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'BuildFromBoardCard', N'app.TodoItem', CAST(@Id AS NVARCHAR(64)),
            (SELECT TodoItemId, [ProjectId], [BoardCardId], [TodoItem], [DueDate], [Status]
             FROM app.TodoItem WHERE TodoItemId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)),
           (@ActorUserId, N'Create', N'app.TodoAlert', CAST(@AlertId AS NVARCHAR(64)),
            (SELECT TodoAlertId, [TodoItemId], [AlertDay], [IsDismissed]
             FROM app.TodoAlert WHERE TodoAlertId = @AlertId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @Id AS TodoItemId, CAST(0 AS BIT) AS Existed;
END;
GO
