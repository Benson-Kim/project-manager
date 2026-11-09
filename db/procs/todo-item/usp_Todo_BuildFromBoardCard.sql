-- usp_Todo_BuildFromBoardCard — a to-do with an all-day alert on a dated Kanban card's due day.
-- Copies the card's label → TodoItem, DueDate → DueDate and AlertDay; ProjectId is the board's.
-- Label: the card's Title, else its deliverable's title when the actor can see it, else its
--   requirement's text when the actor can see it (the same redaction as usp_BoardCard_GetById),
--   else '(untitled card)'.
-- Write order (ADR-0038): lock the board row, THEN assert access, THEN read the card under the
--   lock, so a board moving project or a card being deleted cannot slip between check and write.
-- A card holds at most one live to-do (migration 069): when it already has one, nothing is written
--   and Existed = 1; its TodoItemId is returned only when the actor may open it, else NULL.
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

    DECLARE @BoardId INT =
        (SELECT BoardId FROM app.BoardCard WHERE BoardCardId = @BoardCardId AND IsDeleted = 0);
    IF @BoardId IS NULL
        THROW 50001, N'NOT_FOUND:Card not found', 1;

    BEGIN TRAN;

    DECLARE @Lock INT, @ProjectId INT;
    SELECT @Lock = BoardId, @ProjectId = ProjectId FROM app.Board WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardId = @BoardId AND IsDeleted = 0;
    IF @Lock IS NULL
        THROW 50001, N'NOT_FOUND:Card not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';
    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'todo-items:create', @AllowProjectless = 1;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    DECLARE @Found BIT = 0, @Label NVARCHAR(MAX), @DueDate DATE;
    SELECT @Found = 1,
           @DueDate = c.DueDate,
           @Label = COALESCE(
               NULLIF(LTRIM(RTRIM(c.Title)), N''),
               CASE WHEN dv.DeliverableState = 'live'
                    THEN NULLIF(LTRIM(RTRIM(dv.DeliverableTitle)), N'') END,
               CASE WHEN ra.AccessLevel IS NOT NULL AND rq.IsDeleted = 0
                    THEN NULLIF(LTRIM(RTRIM(rq.Requirement)), N'') END,
               N'(untitled card)')
    FROM app.BoardCard c
    LEFT JOIN app.Requirement rq ON rq.RequirementId = c.RequirementId
    OUTER APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, rq.ProjectId, 0) ra
    CROSS APPLY dbo.ufn_BoardCard_Deliverable(c.KeyDeliverableId, @ActorRole, @ActorUserId) dv
    WHERE c.BoardCardId = @BoardCardId AND c.BoardId = @BoardId AND c.IsDeleted = 0;
    IF @Found = 0
        THROW 50001, N'NOT_FOUND:Card not found', 1;
    IF @DueDate IS NULL
        THROW 50001, N'NOT_FOUND:The card has no due date', 1;

    DECLARE @Id INT, @ItemProjectId INT, @OwnerUserId INT;
    SELECT @Id = TodoItemId, @ItemProjectId = ProjectId, @OwnerUserId = CreatedBy
    FROM app.TodoItem WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardCardId = @BoardCardId AND IsDeleted = 0;

    IF @Id IS NOT NULL
    BEGIN
        COMMIT;
        SELECT CASE WHEN a.AccessLevel IS NOT NULL THEN @Id END AS TodoItemId,
               CAST(1 AS BIT) AS Existed
        FROM (SELECT 1 AS One) o
        OUTER APPLY dbo.ufn_TodoItem_AccessLevel(@ActorRole, @ActorUserId, @ItemProjectId, @OwnerUserId) a;
        RETURN;
    END;

    INSERT INTO app.TodoItem ([ProjectId], [BoardCardId], [TodoItem], [DueDate], [Status], CreatedBy)
    VALUES (@ProjectId, @BoardCardId, LEFT(@Label, 255), @DueDate, N'Not Started', @ActorUserId);
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
