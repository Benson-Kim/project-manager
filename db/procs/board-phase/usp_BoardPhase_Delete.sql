-- usp_BoardPhase_Delete — soft-delete one phase. Its sprints are NOT deleted with it: they are
-- released to "no phase", which is a state the schema allows (app.BoardSprint.BoardPhaseId is
-- NULLable, and the plan says sprints without a phase are allowed). Returns how many sprints were
-- released, so the interface can say what happened rather than silently regrouping the plan.
-- Write order (ADR-0038, pinned by src/tests/board-sql-guardrails.test.ts): lock the board row,
--   THEN assert access (see usp_BoardPhase_Create).
-- Row-level access: Manager on the board with 'boards:delete' (dbo.usp_Board_AssertAccess),
--   CONFLICT 50002 on a stale RowVer.
-- Releasing the sprints is what keeps the composite foreign key honest: FK_BoardSprint_Phase points
--   at (BoardId, BoardPhaseId), and a soft delete leaves that row in place, so without this UPDATE a
--   live sprint would still read as grouped under a phase nobody can see. The plan's race matrix
--   requires exactly that — "delete a phase while a sprint is assigned to it: no live sprint in a
--   deleted phase" — and it holds because both writes happen under the one board lock.
-- Only live sprints are released (IsDeleted = 0), the same line usp_BoardColumn_Delete draws when it
--   reflows only live cards: a soft-deleted sprint keeps its historical grouping.
-- A phase carries no cards and no work-in-progress limit, so nothing here consults
--   dbo.usp_Board_AssertRoom; releasing a sprint does not move a card between columns.
-- Entity app.BoardPhase. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardPhase_Delete
    @BoardPhaseId INT,
    @RowVer       BIGINT,
    @ActorUserId  INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

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
         @MinLevel = N'Manager', @Permission = N'boards:delete';

    IF NOT EXISTS (SELECT 1 FROM app.BoardPhase
                   WHERE BoardPhaseId = @BoardPhaseId AND IsDeleted = 0
                     AND CAST(RowVer AS BIGINT) = @RowVer)
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.BoardPhase WHERE BoardPhaseId = @BoardPhaseId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Phase not found', 1;
        THROW 50002, N'CONFLICT:The phase was changed by someone else', 1;
    END;

    DECLARE @Sprints INT =
        (SELECT COUNT(*) FROM app.BoardSprint
         WHERE BoardId = @BoardId AND BoardPhaseId = @BoardPhaseId AND IsDeleted = 0);

    IF @Sprints > 0
        UPDATE app.BoardSprint SET
            BoardPhaseId = NULL,
            UpdatedAtUtc = SYSUTCDATETIME(),
            UpdatedBy = @ActorUserId
        WHERE BoardId = @BoardId AND BoardPhaseId = @BoardPhaseId AND IsDeleted = 0;

    UPDATE app.BoardPhase SET
        IsDeleted = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy = @ActorUserId
    WHERE BoardPhaseId = @BoardPhaseId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Delete', N'app.BoardPhase', CAST(@BoardPhaseId AS NVARCHAR(64)),
            (SELECT @BoardId AS BoardId, @Sprints AS SprintCount
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
            (SELECT @Sprints AS ReleasedSprints
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT @Sprints AS ReleasedSprints;
END;
GO
