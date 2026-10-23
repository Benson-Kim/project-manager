-- usp_BoardPhase_Move — move a phase one place up or down within its board. The board's phases are
-- renumbered 1..n first, then the phase swaps SortOrder with its neighbour; at either end nothing
-- moves. RowVer of the moved phase guards the write (CONFLICT 50002).
-- Write order (ADR-0038): lock the board row, THEN assert access (see usp_BoardPhase_Create). A
--   reorder renumbers the board's phases, so it bumps their RowVers (LESSONS §29) — a rare CONFLICT
--   for another user mid-edit, the same trade-off usp_BoardColumn_Move and usp_FinancialLine_Move
--   accept.
-- Row-level access: Contributor on the board with 'boards:update' (dbo.usp_Board_AssertAccess).
-- Phases order the planning view only; a phase carries no cards, so a reorder moves no work and
--   never touches a work-in-progress limit.
-- Entity app.BoardPhase. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardPhase_Move
    @BoardPhaseId INT,
    @Direction    VARCHAR(10),
    @RowVer       BIGINT,
    @ActorUserId  INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF ISNULL(@Direction, '') NOT IN ('up', 'down')
        THROW 50004, N'VALIDATION:Direction must be up or down', 1;

    DECLARE @BoardId INT;
    SELECT @BoardId = BoardId FROM app.BoardPhase
    WHERE BoardPhaseId = @BoardPhaseId AND IsDeleted = 0;
    IF @BoardId IS NULL
        THROW 50001, N'NOT_FOUND:Phase not found', 1;

    BEGIN TRAN;

    DECLARE @Lock INT;
    SELECT @Lock = BoardId FROM app.Board WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardId = @BoardId AND IsDeleted = 0;
    IF @Lock IS NULL
        THROW 50001, N'NOT_FOUND:Board not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'boards:update';

    IF NOT EXISTS (SELECT 1 FROM app.BoardPhase
                   WHERE BoardPhaseId = @BoardPhaseId AND IsDeleted = 0
                     AND CAST(RowVer AS BIGINT) = @RowVer)
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.BoardPhase WHERE BoardPhaseId = @BoardPhaseId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Phase not found', 1;
        THROW 50002, N'CONFLICT:The phase was changed by someone else', 1;
    END;

    WITH ordered AS (
        SELECT SortOrder, ROW_NUMBER() OVER (ORDER BY SortOrder, BoardPhaseId) AS Position
        FROM app.BoardPhase
        WHERE BoardId = @BoardId AND IsDeleted = 0
    )
    UPDATE ordered SET SortOrder = Position WHERE SortOrder <> Position;

    DECLARE @Position INT = (SELECT SortOrder FROM app.BoardPhase WHERE BoardPhaseId = @BoardPhaseId);
    DECLARE @Target INT = @Position + CASE WHEN @Direction = 'up' THEN -1 ELSE 1 END;
    DECLARE @NeighbourId INT =
        (SELECT BoardPhaseId FROM app.BoardPhase
         WHERE BoardId = @BoardId AND IsDeleted = 0 AND SortOrder = @Target);

    IF @NeighbourId IS NOT NULL
    BEGIN
        UPDATE app.BoardPhase SET
            SortOrder = CASE WHEN BoardPhaseId = @BoardPhaseId THEN @Target ELSE @Position END,
            UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE BoardPhaseId IN (@BoardPhaseId, @NeighbourId);

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
        VALUES (@ActorUserId, N'Move', N'app.BoardPhase', CAST(@BoardPhaseId AS NVARCHAR(64)),
                (SELECT @Position AS SortOrder FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                (SELECT @Target AS SortOrder FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
    END;

    COMMIT;

    SELECT BoardPhaseId,
           BoardId,
           [Name],
           StartDate,
           EndDate,
           SortOrder,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.BoardPhase
    WHERE BoardPhaseId = @BoardPhaseId;
END;
GO
