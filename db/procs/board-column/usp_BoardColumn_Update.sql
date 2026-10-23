-- usp_BoardColumn_Update — rename a column, change its category or its work-in-progress limit, with
-- rowversion concurrency and an in-transaction audit row.
-- Write order (ADR-0038): lock the board row, THEN assert access (see usp_BoardColumn_Create). The
--   column's own RowVer guards the write; the board row is the lock that serialises structural
--   changes and names the project that governs access.
-- Row-level access: Contributor on the board with 'boards:update' (dbo.usp_Board_AssertAccess).
-- Lowering a WIP limit may leave a column already over the new limit; that is allowed (ADR-0038) —
--   the column shows as over and takes nothing new. Never moves the column between boards.
-- Entity app.BoardColumn. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardColumn_Update
    @BoardColumnId INT,
    @RowVer        BIGINT,
    @Name          NVARCHAR(60),
    @Category      VARCHAR(10),
    @WipLimit      INT = NULL,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Name = LTRIM(RTRIM(@Name));
    IF @Name IS NULL OR LEN(@Name) = 0 OR LEN(@Name) > 60
        THROW 50004, N'VALIDATION:A column needs a name of up to 60 characters', 1;
    IF ISNULL(@Category, '') NOT IN ('todo', 'doing', 'done')
        THROW 50004, N'VALIDATION:A column is a to do, doing or done column', 1;
    IF @WipLimit IS NOT NULL AND @WipLimit NOT BETWEEN 1 AND 999
        THROW 50004, N'VALIDATION:A work-in-progress limit is a number from 1 to 999', 1;

    DECLARE @BoardId INT;
    SELECT @BoardId = BoardId FROM app.BoardColumn
    WHERE BoardColumnId = @BoardColumnId AND IsDeleted = 0;
    IF @BoardId IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;

    BEGIN TRAN;

    DECLARE @CurrentVer BIGINT;
    SELECT @CurrentVer = CAST(bc.RowVer AS BIGINT)
    FROM app.Board b WITH (UPDLOCK, HOLDLOCK)
    JOIN app.BoardColumn bc ON bc.BoardId = b.BoardId
    WHERE b.BoardId = @BoardId AND bc.BoardColumnId = @BoardColumnId AND bc.IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'boards:update';

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:The column was changed by someone else', 1;

    IF EXISTS (SELECT 1 FROM app.BoardColumn
               WHERE BoardId = @BoardId AND IsDeleted = 0
                 AND BoardColumnId <> @BoardColumnId AND LTRIM(RTRIM([Name])) = @Name)
        THROW 50005, N'DUPLICATE:A column with this name already exists', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT BoardColumnId, BoardId, [Name], Category, WipLimit, SortOrder
         FROM app.BoardColumn WHERE BoardColumnId = @BoardColumnId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    UPDATE app.BoardColumn SET
        [Name]       = @Name,
        Category     = @Category,
        WipLimit     = @WipLimit,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE BoardColumnId = @BoardColumnId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:The column was changed by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.BoardColumn', CAST(@BoardColumnId AS NVARCHAR(64)), @Before,
            (SELECT BoardColumnId, BoardId, [Name], Category, WipLimit, SortOrder
             FROM app.BoardColumn WHERE BoardColumnId = @BoardColumnId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

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
