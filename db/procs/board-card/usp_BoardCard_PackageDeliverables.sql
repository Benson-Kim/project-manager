-- usp_BoardCard_PackageDeliverables — put 1-200 deliverables on a board as cards, atomically
-- (ADR-0052), the deliverable twin of dbo.usp_BoardCard_Package. The "Deliverable" source of the
-- new-card dialog and "Add to board" on the work breakdown both come here.
-- Write order (ADR-0038): lock the board row, THEN assert access: Contributor on the board with
--   'boards:create', and Viewer with 'key-deliverables:read' on every deliverable's project.
-- A deliverable must be live and in the board's project (any project the actor can read when the
--   board has none). Deliverables that already have a live card on this board are skipped, which
--   UQ_BoardCard_Deliverable backs. The WIP limit counts only the cards actually added.
-- A deliverable card carries no title of its own: CK_BoardCard_Content accepts the deliverable.
-- Returns AddedCards and SkippedCards.
-- Entity app.BoardCard. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardCard_PackageDeliverables
    @BoardId           INT,
    @BoardColumnId     INT,
    @BoardSprintId     INT = NULL,
    @KeyDeliverableIds NVARCHAR(MAX),
    @ActorUserId       INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF ISJSON(@KeyDeliverableIds) <> 1 OR LEFT(LTRIM(@KeyDeliverableIds), 1) <> '['
        THROW 50004, N'VALIDATION:Select deliverables', 1;
    IF EXISTS (
        SELECT 1 FROM OPENJSON(@KeyDeliverableIds)
        WHERE [type] <> 2 OR TRY_CONVERT(INT, [value]) IS NULL
           OR TRY_CONVERT(INT, [value]) < 1
    )
        THROW 50004, N'VALIDATION:Invalid deliverable identifier', 1;

    DECLARE @Ids TABLE (Id INT PRIMARY KEY);
    INSERT INTO @Ids
    SELECT DISTINCT CONVERT(INT, [value]) FROM OPENJSON(@KeyDeliverableIds);
    IF (SELECT COUNT(*) FROM @Ids) NOT BETWEEN 1 AND 200
        THROW 50004, N'VALIDATION:Select between one and 200 deliverables', 1;

    BEGIN TRAN;
    DECLARE @Lock INT, @ProjectId INT;
    SELECT @Lock = BoardId, @ProjectId = ProjectId
    FROM app.Board WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardId = @BoardId AND IsDeleted = 0;
    IF @Lock IS NULL THROW 50001, N'NOT_FOUND:Board not found', 1;

    EXEC dbo.usp_Board_AssertAccess
        @BoardId = @BoardId, @ActorUserId = @ActorUserId,
        @MinLevel = N'Contributor', @Permission = N'boards:create';

    IF NOT EXISTS (
        SELECT 1 FROM app.BoardColumn
        WHERE BoardColumnId = @BoardColumnId AND BoardId = @BoardId AND IsDeleted = 0
    )
        THROW 50004, N'VALIDATION:That column is not on this board', 1;
    IF @BoardSprintId IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM app.BoardSprint
        WHERE BoardSprintId = @BoardSprintId AND BoardId = @BoardId
          AND IsDeleted = 0 AND [State] <> 'completed'
    )
        THROW 50004, N'VALIDATION:That sprint cannot take cards', 1;

    DECLARE @Id INT, @DeliverableProject INT;
    DECLARE deliverables CURSOR LOCAL FAST_FORWARD FOR SELECT Id FROM @Ids ORDER BY Id;
    OPEN deliverables;
    FETCH NEXT FROM deliverables INTO @Id;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @DeliverableProject = NULL;
        SELECT @DeliverableProject = ProjectId
        FROM app.KeyDeliverable WITH (UPDLOCK, HOLDLOCK)
        WHERE KeyDeliverableId = @Id AND IsDeleted = 0;
        IF @DeliverableProject IS NULL THROW 50001, N'NOT_FOUND:Deliverable not found', 1;

        EXEC dbo.usp_Project_AssertAccess
            @ProjectId = @DeliverableProject, @ActorUserId = @ActorUserId,
            @MinLevel = N'Viewer', @Permission = N'key-deliverables:read', @AllowProjectless = 0;
        IF @ProjectId IS NOT NULL AND @ProjectId <> @DeliverableProject
            THROW 50004, N'VALIDATION:The deliverable must belong to the board project', 1;
        FETCH NEXT FROM deliverables INTO @Id;
    END;
    CLOSE deliverables;
    DEALLOCATE deliverables;

    DECLARE @Selected INT = (SELECT COUNT(*) FROM @Ids);
    DELETE i FROM @Ids AS i
    WHERE EXISTS (
        SELECT 1 FROM app.BoardCard AS c
        WHERE c.BoardId = @BoardId AND c.KeyDeliverableId = i.Id AND c.IsDeleted = 0
    );
    DECLARE @Adding INT = (SELECT COUNT(*) FROM @Ids);
    EXEC dbo.usp_Board_AssertRoom
        @BoardId = @BoardId, @BoardColumnId = @BoardColumnId, @Adding = @Adding;

    DECLARE @Rank BIGINT = ISNULL((
        SELECT MAX(SortKey) FROM app.BoardCard WHERE BoardId = @BoardId AND IsDeleted = 0
    ), 0);
    DECLARE @Created TABLE (BoardCardId INT, KeyDeliverableId INT);
    INSERT INTO app.BoardCard (BoardId, BoardColumnId, BoardSprintId, KeyDeliverableId, SortKey, CreatedBy)
    OUTPUT INSERTED.BoardCardId, INSERTED.KeyDeliverableId INTO @Created
    SELECT @BoardId, @BoardColumnId, @BoardSprintId, Id,
           @Rank + ROW_NUMBER() OVER (ORDER BY Id) * 1048576, @ActorUserId
    FROM @Ids;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    SELECT @ActorUserId, N'Create', N'app.BoardCard', CAST(c.BoardCardId AS NVARCHAR(64)),
           (SELECT @BoardId AS BoardId, @BoardColumnId AS BoardColumnId, c.KeyDeliverableId
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM @Created AS c;
    COMMIT;

    SELECT @Adding AS AddedCards, @Selected - @Adding AS SkippedCards;
END;
GO
