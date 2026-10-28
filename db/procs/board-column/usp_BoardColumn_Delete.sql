-- usp_BoardColumn_Delete — soft-delete one column. Its cards are not deleted with it: they move to
-- @TargetColumnId, which must have room for all of them. Returns how many moved, so the interface
-- can say what happened rather than silently relocating work.
-- Write order (ADR-0038, pinned by src/tests/board-sql-guardrails.test.ts): lock the board row,
--   THEN assert access. This proc lives outside db/procs/board/, so it reaches the board rule
--   through dbo.usp_Board_AssertAccess (see usp_BoardColumn_Create).
-- Row-level access: Manager on the board with 'boards:delete' (dbo.usp_Board_AssertAccess),
--   CONFLICT 50002 on a stale RowVer.
-- A board always keeps at least one column: deleting the last one would leave a board no card
--   could ever sit on, and nothing in the interface could undo it. That is a proc check, because
--   "at least one" cannot be a constraint on the row being removed.
-- WIP: the target must have room for the whole reflow, asked in ONE call to dbo.usp_Board_AssertRoom
--   (@Adding = the number moving). Checking one card at a time could refuse halfway and leave the
--   board half-emptied. The source column is sized with @Adding = 0, which never throws — a column
--   already over its limit (a sprint started, or the limit was lowered) must still be emptiable.
-- Entity app.BoardColumn. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardColumn_Delete
    @BoardColumnId  INT,
    @RowVer         BIGINT,
    @TargetColumnId INT = NULL,
    @ActorUserId    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

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
         @MinLevel = N'Manager', @Permission = N'boards:delete';

    IF NOT EXISTS (SELECT 1 FROM app.BoardColumn
                   WHERE BoardColumnId = @BoardColumnId AND IsDeleted = 0
                     AND CAST(RowVer AS BIGINT) = @RowVer)
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.BoardColumn WHERE BoardColumnId = @BoardColumnId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Column not found', 1;
        THROW 50002, N'CONFLICT:The column was changed by someone else', 1;
    END;

    IF (SELECT COUNT(*) FROM app.BoardColumn WHERE BoardId = @BoardId AND IsDeleted = 0) <= 1
        THROW 50004, N'VALIDATION:A board keeps at least one column', 1;

    DECLARE @Cards INT =
        (SELECT COUNT(*) FROM app.BoardCard
         WHERE BoardId = @BoardId AND BoardColumnId = @BoardColumnId AND IsDeleted = 0);

    IF @Cards > 0
    BEGIN
        IF @TargetColumnId IS NULL
            THROW 50004, N'VALIDATION:Choose a column for this one''s cards before deleting it', 1;
        IF @TargetColumnId = @BoardColumnId
            THROW 50004, N'VALIDATION:The cards need a different column to move to', 1;
        IF NOT EXISTS (SELECT 1 FROM app.BoardColumn
                       WHERE BoardColumnId = @TargetColumnId AND BoardId = @BoardId AND IsDeleted = 0)
            THROW 50004, N'VALIDATION:That column is not on this board', 1;

        -- Only the cards the board is counting move against the target's limit; the rest (in a
        -- completed sprint) still change column, but they were never in anyone's way.
        DECLARE @Moving INT;
        EXEC dbo.usp_Board_AssertRoom
             @BoardId = @BoardId, @BoardColumnId = @BoardColumnId,
             @Adding = 0, @InScope = @Moving OUTPUT;

        EXEC dbo.usp_Board_AssertRoom
             @BoardId = @BoardId, @BoardColumnId = @TargetColumnId, @Adding = @Moving;

        UPDATE app.BoardCard SET
            BoardColumnId = @TargetColumnId,
            UpdatedAtUtc = SYSUTCDATETIME(),
            UpdatedBy = @ActorUserId
        WHERE BoardId = @BoardId AND BoardColumnId = @BoardColumnId AND IsDeleted = 0;
    END;

    UPDATE app.BoardColumn SET
        IsDeleted = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy = @ActorUserId
    WHERE BoardColumnId = @BoardColumnId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Delete', N'app.BoardColumn', CAST(@BoardColumnId AS NVARCHAR(64)),
            (SELECT @BoardId AS BoardId, @Cards AS CardCount
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
            (SELECT @TargetColumnId AS MovedToColumnId, @Cards AS MovedCards
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT @Cards AS MovedCards, @TargetColumnId AS MovedToColumnId;
END;
GO
