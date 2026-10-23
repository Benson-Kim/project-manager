-- usp_BoardPhase_Update — rename one phase and set its dates; returns the updated phase.
-- Write order (ADR-0038, pinned by src/tests/board-sql-guardrails.test.ts): lock the board row,
--   THEN assert access (see usp_BoardPhase_Create), THEN guard this phase's own RowVer.
-- Row-level access: Contributor on the board with 'boards:update' (dbo.usp_Board_AssertAccess).
--   CONFLICT 50002 on a stale RowVer; a phase that has since been deleted answers NOT_FOUND 50001
--   rather than CONFLICT, so a deleted row never reads as someone else's edit.
-- A phase never changes board: @BoardId is not a parameter, and the board is read from the row.
--   Moving a grouping between boards would carry its sprints' composite foreign key with it.
-- SortOrder is not a parameter either: ordering is its own intention (usp_BoardPhase_Move), so an
--   edit of a name cannot silently reorder the planning view.
-- Entity app.BoardPhase. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardPhase_Update
    @BoardPhaseId INT,
    @RowVer       BIGINT,
    @Name         NVARCHAR(100),
    @StartDate    DATE = NULL,
    @EndDate      DATE = NULL,
    @ActorUserId  INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Name = LTRIM(RTRIM(@Name));
    IF @Name IS NULL OR LEN(@Name) = 0 OR LEN(@Name) > 100
        THROW 50004, N'VALIDATION:A phase needs a name of up to 100 characters', 1;
    IF @StartDate IS NOT NULL AND @EndDate IS NOT NULL AND @EndDate < @StartDate
        THROW 50004, N'VALIDATION:A phase ends on or after the day it starts', 1;

    DECLARE @BoardId INT;
    SELECT @BoardId = BoardId FROM app.BoardPhase
    WHERE BoardPhaseId = @BoardPhaseId AND IsDeleted = 0;
    IF @BoardId IS NULL
        THROW 50001, N'NOT_FOUND:Phase not found', 1;

    BEGIN TRAN;

    DECLARE @CurrentVer BIGINT;
    SELECT @CurrentVer = CAST(ph.RowVer AS BIGINT)
    FROM app.Board b WITH (UPDLOCK, HOLDLOCK)
    JOIN app.BoardPhase ph ON ph.BoardId = b.BoardId
    WHERE b.BoardId = @BoardId AND b.IsDeleted = 0
      AND ph.BoardPhaseId = @BoardPhaseId AND ph.IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Phase not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'boards:update';

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:The phase was changed by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT BoardPhaseId, BoardId, [Name], StartDate, EndDate, SortOrder
         FROM app.BoardPhase WHERE BoardPhaseId = @BoardPhaseId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    UPDATE app.BoardPhase SET
        [Name]       = @Name,
        StartDate    = @StartDate,
        EndDate      = @EndDate,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE BoardPhaseId = @BoardPhaseId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:The phase was changed by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.BoardPhase', CAST(@BoardPhaseId AS NVARCHAR(64)), @Before,
            (SELECT BoardPhaseId, BoardId, [Name], StartDate, EndDate, SortOrder
             FROM app.BoardPhase WHERE BoardPhaseId = @BoardPhaseId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

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
