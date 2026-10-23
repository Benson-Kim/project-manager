-- usp_Board_Update — rename a board or change its description, with rowversion concurrency and an
-- in-transaction audit row.
-- Write order (ADR-0038, pinned by src/tests/board-sql-guardrails.test.ts): lock the board row, THEN
--   assert access. A board's ProjectId can change (dbo.usp_Board_SetProject), so a check made before
--   the lock could be a check against the project the board has just left. The WBS can check first
--   (dbo.usp_KeyDeliverable_Move) because a deliverable never changes project.
-- Row-level access: Contributor on the board with 'boards:update' (dbo.usp_Board_AssertAccess,
--   NOT_FOUND 50001, FORBIDDEN_ROW 50003). Never changes ProjectId: linking a board to a project is
--   its own intention, because it crosses two projects' access.
-- Entity app.Board. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Board_Update
    @BoardId     INT,
    @RowVer      BIGINT,
    @Name        NVARCHAR(200),
    @Description NVARCHAR(2000) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Name IS NULL OR LEN(LTRIM(RTRIM(@Name))) = 0
        THROW 50004, N'VALIDATION:Enter a board name', 1;

    BEGIN TRAN;

    DECLARE @CurrentVer BIGINT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.Board WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardId = @BoardId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Board not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'boards:update';

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Board was modified by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT BoardId, ProjectId, [Name], [Description]
         FROM app.Board WHERE BoardId = @BoardId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    UPDATE app.Board SET
        [Name]       = LTRIM(RTRIM(@Name)),
        [Description] = @Description,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE BoardId = @BoardId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Board was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Board', CAST(@BoardId AS NVARCHAR(64)), @Before,
            (SELECT BoardId, ProjectId, [Name], [Description]
             FROM app.Board WHERE BoardId = @BoardId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT BoardId,
           ProjectId,
           [Name],
           [Description],
           CreatedBy,
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Board
    WHERE BoardId = @BoardId;
END;
GO
