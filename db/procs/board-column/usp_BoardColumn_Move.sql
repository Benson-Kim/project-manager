-- usp_BoardColumn_Move — move a column one place left (up) or right (down) within its board. The
-- board's columns are renumbered 1..n first, then the column swaps SortOrder with its neighbour; at
-- either end nothing moves. RowVer of the moved column guards the write (CONFLICT 50002).
-- Write order (ADR-0038): lock the board row, THEN assert access (see usp_BoardColumn_Create). A
--   reorder renumbers the board's columns, so it bumps their RowVers (LESSONS §29) — a rare CONFLICT
--   for another user mid-edit, the same trade-off usp_FinancialLine_Move accepts.
-- Row-level access: Contributor on the board with 'boards:update' (dbo.usp_Board_AssertAccess).
-- A positional (drag-to-index) move can replace @Direction when the board view lands; up/down is the
--   codebase's proven reorder idiom (usp_FinancialLine_Move) and is keyboard-reachable.
-- Entity app.BoardColumn. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardColumn_Move
    @BoardColumnId INT,
    @Direction     VARCHAR(10),
    @RowVer        BIGINT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF ISNULL(@Direction, '') NOT IN ('up', 'down')
        THROW 50004, N'VALIDATION:Direction must be up or down', 1;

    DECLARE @BoardId INT;
    SELECT @BoardId = BoardId FROM app.BoardColumn
    WHERE BoardColumnId = @BoardColumnId AND IsDeleted = 0;
    IF @BoardId IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;

    BEGIN TRAN;

    DECLARE @Lock INT;
    SELECT @Lock = BoardId FROM app.Board WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardId = @BoardId AND IsDeleted = 0;
    IF @Lock IS NULL
        THROW 50001, N'NOT_FOUND:Board not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'boards:update';

    IF NOT EXISTS (SELECT 1 FROM app.BoardColumn
                   WHERE BoardColumnId = @BoardColumnId AND IsDeleted = 0
                     AND CAST(RowVer AS BIGINT) = @RowVer)
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.BoardColumn WHERE BoardColumnId = @BoardColumnId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Column not found', 1;
        THROW 50002, N'CONFLICT:The column was changed by someone else', 1;
    END;

    WITH ordered AS (
        SELECT SortOrder, ROW_NUMBER() OVER (ORDER BY SortOrder, BoardColumnId) AS Position
        FROM app.BoardColumn
        WHERE BoardId = @BoardId AND IsDeleted = 0
    )
    UPDATE ordered SET SortOrder = Position WHERE SortOrder <> Position;

    DECLARE @Position INT = (SELECT SortOrder FROM app.BoardColumn WHERE BoardColumnId = @BoardColumnId);
    DECLARE @Target INT = @Position + CASE WHEN @Direction = 'up' THEN -1 ELSE 1 END;
    DECLARE @NeighbourId INT =
        (SELECT BoardColumnId FROM app.BoardColumn
         WHERE BoardId = @BoardId AND IsDeleted = 0 AND SortOrder = @Target);

    IF @NeighbourId IS NOT NULL
    BEGIN
        UPDATE app.BoardColumn SET
            SortOrder = CASE WHEN BoardColumnId = @BoardColumnId THEN @Target ELSE @Position END,
            UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE BoardColumnId IN (@BoardColumnId, @NeighbourId);

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
        VALUES (@ActorUserId, N'Move', N'app.BoardColumn', CAST(@BoardColumnId AS NVARCHAR(64)),
                (SELECT @Position AS SortOrder FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                (SELECT @Target AS SortOrder FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
    END;

    COMMIT;

    SELECT BoardColumnId,
           BoardId,
           [Name],
           Category,
           WipLimit,
           SortOrder,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.BoardColumn
    WHERE BoardColumnId = @BoardColumnId;
END;
GO
