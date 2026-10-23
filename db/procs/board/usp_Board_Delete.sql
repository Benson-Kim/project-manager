-- usp_Board_Delete — soft delete with rowversion concurrency and an in-transaction audit row.
-- Write order (ADR-0038): lock the board row, THEN assert access (see dbo.usp_Board_Update).
-- Row-level access: Manager on the board with 'boards:delete' (dbo.usp_Board_AssertAccess). On a
--   standalone board that is its creator or an Admin; on a project board, that project's Managers,
--   or anyone a Manager granted 'boards:delete' (ADR-0024).
-- Deletes the board only. Its columns, phases, sprints and cards stay, as a project's records stay
--   when the project goes (dbo.usp_Project_Delete), and nothing can reach them: every board read and
--   write resolves the board first, and dbo.usp_Board_AssertAccess refuses a deleted one.
-- Entity app.Board. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Board_Delete
    @BoardId     INT,
    @RowVer      BIGINT,
    @ActorUserId INT
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

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Board was modified by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT BoardId, ProjectId, [Name], [Description]
         FROM app.Board WHERE BoardId = @BoardId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    UPDATE app.Board SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE BoardId = @BoardId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Board was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.Board', CAST(@BoardId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
