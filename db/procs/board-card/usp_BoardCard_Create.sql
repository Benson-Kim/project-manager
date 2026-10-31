-- usp_BoardCard_Create — add one card to a board, at the end of the board-wide order, with an
-- in-transaction audit row; returns the new card.
-- Write order (ADR-0038, pinned by src/tests/board-sql-guardrails.test.ts): lock the board row,
--   THEN assert access. A board's ProjectId can change (dbo.usp_Board_SetProject), so a check made
--   before the lock could be against the project the board has just left. This proc lives outside
--   db/procs/board/, so it reaches the board rule through dbo.usp_Board_AssertAccess (a proc call
--   resolves at run time, whichever order the applier created the folders).
-- Row-level access: Contributor on the board with 'boards:create' (dbo.usp_Board_AssertAccess).
-- A card created here always carries a Title. RequirementId is set only by packaging
--   (dbo.usp_BoardCard_Package), never from a payload, so the CK_BoardCard_Content constraint is
--   satisfied by the title alone and a client cannot attach a requirement by naming its id.
-- The column and sprint are checked against THIS board before the composite foreign keys can fire
--   (a 547 would surface as INTERNAL), and the WIP limit is checked by dbo.usp_Board_AssertRoom
--   under the board lock, which is what makes the limit hold when two people create at once.
-- Entity app.BoardCard. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardCard_Create
    @BoardId        INT,
    @BoardColumnId  INT,
    @BoardSprintId  INT = NULL,
    @Title          NVARCHAR(300),
    @Notes          NVARCHAR(MAX) = NULL,
    @AssigneeUserId INT = NULL,
    @DueDate        DATE = NULL,
    @StoryPoints    INT = NULL,
    @Color          VARCHAR(10) = NULL,
    @ActorUserId    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Title = LTRIM(RTRIM(@Title));
    IF @Title IS NULL OR LEN(@Title) = 0 OR LEN(@Title) > 300
        THROW 50004, N'VALIDATION:A card needs a title of up to 300 characters', 1;
    IF @StoryPoints IS NOT NULL AND @StoryPoints NOT BETWEEN 0 AND 999
        THROW 50004, N'VALIDATION:Story points are a number from 0 to 999', 1;
    IF @Color IS NOT NULL AND @Color NOT IN ('red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray')
        THROW 50004, N'VALIDATION:That is not a colour on the palette', 1;

    BEGIN TRAN;

    DECLARE @Lock INT;
    SELECT @Lock = BoardId
    FROM app.Board WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardId = @BoardId AND IsDeleted = 0;
    IF @Lock IS NULL
        THROW 50001, N'NOT_FOUND:Board not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'boards:create';

    IF NOT EXISTS (SELECT 1 FROM app.BoardColumn
                   WHERE BoardColumnId = @BoardColumnId AND BoardId = @BoardId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:That column is not on this board', 1;

    IF @BoardSprintId IS NOT NULL
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.BoardSprint
                       WHERE BoardSprintId = @BoardSprintId AND BoardId = @BoardId AND IsDeleted = 0)
            THROW 50004, N'VALIDATION:That sprint is not on this board', 1;
        IF EXISTS (SELECT 1 FROM app.BoardSprint
                   WHERE BoardSprintId = @BoardSprintId AND [State] = 'completed')
            THROW 50004, N'VALIDATION:A completed sprint does not take new cards', 1;
    END;

    IF @AssigneeUserId IS NOT NULL
        EXEC dbo.usp_BoardCard_AssertAssignee @BoardId = @BoardId, @AssigneeUserId = @AssigneeUserId;

    EXEC dbo.usp_Board_AssertRoom @BoardId = @BoardId, @BoardColumnId = @BoardColumnId;

    -- The end of the board-wide order. Gaps of 2^20 leave room for later moves between neighbours.
    DECLARE @SortKey BIGINT =
        ISNULL((SELECT MAX(SortKey) FROM app.BoardCard WHERE BoardId = @BoardId AND IsDeleted = 0), 0)
        + 1048576;

    INSERT INTO app.BoardCard (BoardId, BoardColumnId, BoardSprintId, Title, Notes,
                               AssigneeUserId, DueDate, StoryPoints, Color, SortKey, CreatedBy)
    VALUES (@BoardId, @BoardColumnId, @BoardSprintId, @Title, @Notes,
            @AssigneeUserId, @DueDate, @StoryPoints, @Color, @SortKey, @ActorUserId);
    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.BoardCard', CAST(@Id AS NVARCHAR(64)),
            (SELECT BoardCardId, BoardId, BoardColumnId, BoardSprintId, Title,
                    AssigneeUserId, DueDate, StoryPoints, Color, SortKey
             FROM app.BoardCard WHERE BoardCardId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT BoardCardId,
           BoardId,
           BoardColumnId,
           BoardSprintId,
           RequirementId,
           KeyDeliverableId,
           Title,
           AssigneeUserId,
           DueDate,
           StoryPoints,
           Color,
           SortKey,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.BoardCard
    WHERE BoardCardId = @Id;
END;
GO
