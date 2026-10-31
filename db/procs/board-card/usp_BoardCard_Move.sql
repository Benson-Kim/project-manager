-- usp_BoardCard_Move — move one card to a column, optionally to a sprint, and to a place in the
-- board-wide order; returns the moved card (BoardId included, so the caller can revalidate).
-- Write order (ADR-0038, pinned by src/tests/board-sql-guardrails.test.ts): lock the board row,
--   THEN assert access, THEN check the WIP limit. The lock is what makes the limit hold: two people
--   dragging into the last free slot serialise on the board row, so the second one sees the first's
--   card and gets 50007.
-- Row-level access: Contributor on the board with 'boards:update' (dbo.usp_Board_AssertAccess).
-- @SprintSet separates "leave the sprint alone" (0) from "set it to @ToSprintId, NULL meaning the
--   backlog" (1). Without it a NULL could not say which was meant, and every column move would
--   silently send the card to the backlog.
-- @BeforeCardId: the card to land in front of, or NULL for the end of the board. The neighbour is
--   read under the lock; if it has moved or gone the client's picture of the order is stale, so the
--   move is refused with CONFLICT 50002 and the client reloads rather than guessing a position.
-- ORDERING — one board-wide rank (SortKey), so the board view and the planning view always agree.
--   A move lands halfway between the neighbour and its predecessor. When those two are adjacent
--   there is nowhere to land, so the board is renumbered back to clean gaps of 2^20 first. A
--   renumber rewrites every live card's SortKey and so bumps every RowVer (LESSONS §29): another
--   user mid-edit gets a CONFLICT. That is the accepted trade-off — the alternative is a board that
--   silently loses its order. Renumbering writes all rows in ONE statement, so the unique index on
--   (BoardId, SortKey) sees only the final, conflict-free set and never raises 2601 as INTERNAL.
-- Entity app.BoardCard. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardCard_Move
    @BoardCardId   INT,
    @RowVer        BIGINT,
    @ToColumnId    INT,
    @ToSprintId    INT = NULL,
    @SprintSet     BIT = 0,
    @BeforeCardId  INT = NULL,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @BoardId INT;
    SELECT @BoardId = BoardId FROM app.BoardCard
    WHERE BoardCardId = @BoardCardId AND IsDeleted = 0;
    IF @BoardId IS NULL
        THROW 50001, N'NOT_FOUND:Card not found', 1;

    BEGIN TRAN;

    DECLARE @Lock INT;
    SELECT @Lock = BoardId FROM app.Board WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardId = @BoardId AND IsDeleted = 0;
    IF @Lock IS NULL
        THROW 50001, N'NOT_FOUND:Board not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'boards:update';

    DECLARE @FromColumnId INT, @FromSprintId INT, @FromSortKey BIGINT;
    SELECT @FromColumnId = BoardColumnId, @FromSprintId = BoardSprintId, @FromSortKey = SortKey
    FROM app.BoardCard
    WHERE BoardCardId = @BoardCardId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @FromColumnId IS NULL
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.BoardCard WHERE BoardCardId = @BoardCardId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Card not found', 1;
        THROW 50002, N'CONFLICT:The card was changed by someone else', 1;
    END;

    IF NOT EXISTS (SELECT 1 FROM app.BoardColumn
                   WHERE BoardColumnId = @ToColumnId AND BoardId = @BoardId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:That column is not on this board', 1;

    DECLARE @NewSprintId INT = CASE WHEN @SprintSet = 1 THEN @ToSprintId ELSE @FromSprintId END;
    IF @SprintSet = 1 AND @ToSprintId IS NOT NULL
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.BoardSprint
                       WHERE BoardSprintId = @ToSprintId AND BoardId = @BoardId AND IsDeleted = 0)
            THROW 50004, N'VALIDATION:That sprint is not on this board', 1;
        IF EXISTS (SELECT 1 FROM app.BoardSprint
                   WHERE BoardSprintId = @ToSprintId AND [State] = 'completed')
            THROW 50004, N'VALIDATION:A completed sprint does not take new cards', 1;
    END;

    -- The card does not count against the limit it is already inside, so a reorder within a full
    -- column still works; a move into a full column from anywhere else does not.
    EXEC dbo.usp_Board_AssertRoom
         @BoardId = @BoardId, @BoardColumnId = @ToColumnId, @ExcludeCardId = @BoardCardId;

    DECLARE @Gap BIGINT = 1048576;
    DECLARE @NewSortKey BIGINT, @BeforeKey BIGINT, @PrevKey BIGINT;

    IF @BeforeCardId IS NULL
    BEGIN
        SELECT @NewSortKey = ISNULL(MAX(SortKey), 0) + @Gap
        FROM app.BoardCard
        WHERE BoardId = @BoardId AND IsDeleted = 0 AND BoardCardId <> @BoardCardId;
    END
    ELSE
    BEGIN
        IF @BeforeCardId = @BoardCardId
            THROW 50004, N'VALIDATION:A card cannot be placed before itself', 1;

        SELECT @BeforeKey = SortKey FROM app.BoardCard
        WHERE BoardCardId = @BeforeCardId AND BoardId = @BoardId AND IsDeleted = 0;
        IF @BeforeKey IS NULL
            THROW 50002, N'CONFLICT:The card it was dropped before has moved', 1;

        SELECT @PrevKey = MAX(SortKey) FROM app.BoardCard
        WHERE BoardId = @BoardId AND IsDeleted = 0
          AND BoardCardId <> @BoardCardId AND SortKey < @BeforeKey;
        SET @PrevKey = ISNULL(@PrevKey, @BeforeKey - (2 * @Gap));

        IF @BeforeKey - @PrevKey < 2
        BEGIN
            -- Every live card in one statement: the index sees only the final, unique set.
            WITH ordered AS (
                SELECT SortKey, ROW_NUMBER() OVER (ORDER BY SortKey, BoardCardId) AS Position
                FROM app.BoardCard
                WHERE BoardId = @BoardId AND IsDeleted = 0
            )
            UPDATE ordered SET SortKey = Position * @Gap;

            SELECT @BeforeKey = SortKey FROM app.BoardCard WHERE BoardCardId = @BeforeCardId;
            SELECT @PrevKey = MAX(SortKey) FROM app.BoardCard
            WHERE BoardId = @BoardId AND IsDeleted = 0
              AND BoardCardId <> @BoardCardId AND SortKey < @BeforeKey;
            SET @PrevKey = ISNULL(@PrevKey, @BeforeKey - (2 * @Gap));
        END;

        SET @NewSortKey = @PrevKey + (@BeforeKey - @PrevKey) / 2;
    END;

    UPDATE app.BoardCard SET
        BoardColumnId = @ToColumnId,
        BoardSprintId = @NewSprintId,
        SortKey = @NewSortKey,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy = @ActorUserId
    WHERE BoardCardId = @BoardCardId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Move', N'app.BoardCard', CAST(@BoardCardId AS NVARCHAR(64)),
            (SELECT @FromColumnId AS BoardColumnId, @FromSprintId AS BoardSprintId,
                    @FromSortKey AS SortKey
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
            (SELECT @ToColumnId AS BoardColumnId, @NewSprintId AS BoardSprintId,
                    @NewSortKey AS SortKey
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
    WHERE BoardCardId = @BoardCardId;
END;
GO
