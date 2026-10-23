-- usp_Board_SetProject — link a board to a project, move it between projects, or unlink it to the
-- standalone space. Its own intention, never a field on an update (dbo.usp_Board_Update takes no
-- @ProjectId): it crosses two projects' access, so one check cannot answer it.
-- Write order (ADR-0038, pinned by src/tests/board-sql-guardrails.test.ts): lock the board row,
--   THEN assert access. On this proc the lock carries the most weight in the module, because
--   ProjectId is the column it changes: a check made before the lock could answer for the project
--   the board is in the act of leaving.
-- Row-level access — TWO checks, both required, with different levels and different permissions.
--   This is the CROSS_SCOPE case registered in src/tests/proc-access-levels.test.ts, which is why
--   that test cannot read one level off this proc the way it does for every other write:
--     * Manager on the board with 'boards:delete' (dbo.usp_Board_AssertAccess) — taking a board out
--       of a project removes it from everyone who reached it through that project, which is
--       delete-weight, not update-weight.
--     * Contributor on the target project with 'boards:create' (dbo.usp_Project_AssertAccess) —
--       landing a board in a project is creating one there, so it demands exactly what
--       dbo.usp_Board_Create demands. @AllowProjectless = 1 because unlinking (@ProjectId NULL)
--       asks no project for permission; the board-side Manager check is the whole gate there.
--   Manager on both sides was rejected: a creator who is only a Contributor on the target project
--   could never link their own board, which is the ordinary case this exists for.
-- FOREIGN REQUIREMENTS — a card may carry an app.Requirement, whose ProjectId is NOT NULL. Landing
--   on a project means every card's requirement must belong to that project. Migration 038
--   deliberately omits the composite foreign key that would make this structural, because a
--   legitimate re-link must stay possible and merely checked, so this proc is where the rule lives.
--   Refused as VALIDATION 50004 unless @RemoveForeignCards = 1, which soft-deletes those cards and
--   audits one row each, and the count comes back as RemovedCards. 50004 and not 50007: 50007 means
--   a limit the user can see and plan around (a full column, a sprint already running), while this
--   is a precondition they can clear.
--   Unlinking takes no cards: a standalone board may legitimately hold several projects'
--   requirements, which is what the read procs' per-reader 'restricted' redaction is for (ADR-0038
--   decision 14), so there is nothing foreign to a board that belongs to no project.
-- Entity app.Board. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Board_SetProject
    @BoardId            INT,
    @RowVer             BIGINT,
    @ProjectId          INT = NULL,
    @RemoveForeignCards BIT = 0,
    @ActorUserId        INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    DECLARE @CurrentVer BIGINT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.Board WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardId = @BoardId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Board not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'boards:delete';

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'boards:create', @AllowProjectless = 1;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Board was modified by someone else', 1;

    -- Captured before anything is written, so BeforeJson is the card as it stood.
    DECLARE @Foreign TABLE (
        BoardCardId INT NOT NULL PRIMARY KEY,
        BeforeJson  NVARCHAR(MAX) NOT NULL
    );

    IF @ProjectId IS NOT NULL
        INSERT INTO @Foreign (BoardCardId, BeforeJson)
        SELECT c.BoardCardId,
               (SELECT c.BoardCardId, c.BoardId, c.BoardColumnId, c.BoardSprintId, c.Title,
                       c.RequirementId, c.AssigneeUserId, c.StoryPoints, c.SortKey
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
        FROM app.BoardCard c
        JOIN app.Requirement r ON r.RequirementId = c.RequirementId
        WHERE c.BoardId = @BoardId AND c.IsDeleted = 0 AND r.ProjectId <> @ProjectId;

    DECLARE @RemovedCards INT = (SELECT COUNT(*) FROM @Foreign);

    IF @RemovedCards > 0 AND @RemoveForeignCards = 0
        THROW 50004, N'VALIDATION:This board holds cards from another project; confirm their removal to continue', 1;

    IF @RemovedCards > 0
    BEGIN
        UPDATE app.BoardCard SET
            IsDeleted    = 1,
            DeletedAtUtc = SYSUTCDATETIME(),
            DeletedBy    = @ActorUserId
        WHERE BoardCardId IN (SELECT BoardCardId FROM @Foreign)
          AND IsDeleted = 0;

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
        SELECT @ActorUserId, N'Delete', N'app.BoardCard',
               CAST(f.BoardCardId AS NVARCHAR(64)), f.BeforeJson
        FROM @Foreign f;
    END

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT BoardId, ProjectId, [Name], [Description]
         FROM app.Board WHERE BoardId = @BoardId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    UPDATE app.Board SET
        ProjectId    = @ProjectId,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE BoardId = @BoardId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Board was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'SetProject', N'app.Board', CAST(@BoardId AS NVARCHAR(64)), @Before,
            (SELECT BoardId, ProjectId, [Name], [Description], RemovedCards = @RemovedCards
             FROM app.Board WHERE BoardId = @BoardId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT b.BoardId,
           b.ProjectId,
           p.ProjectName,
           b.[Name],
           b.[Description],
           b.CreatedBy,
           b.CreatedAtUtc,
           b.UpdatedAtUtc,
           CAST(b.RowVer AS BIGINT) AS RowVer,
           @RemovedCards AS RemovedCards
    FROM app.Board b
    LEFT JOIN app.Project p ON p.ProjectId = b.ProjectId
    WHERE b.BoardId = @BoardId;
END;
GO
