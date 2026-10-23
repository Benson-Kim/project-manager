-- usp_BoardColumn_Create — add one column to a board, at the end (highest SortOrder + 1), with an
-- in-transaction audit row; returns the new column.
-- Write order (ADR-0038, pinned by src/tests/board-sql-guardrails.test.ts): lock the board row,
--   THEN assert access. A board's ProjectId can change (dbo.usp_Board_SetProject), so a check made
--   before the lock could be against the project the board has just left. This proc lives outside
--   db/procs/board/, so it reaches the board rule through dbo.usp_Board_AssertAccess (a proc call
--   resolves at run time, whichever order the applier created the folders); financial-line/ does the
--   same with dbo.usp_Financial_AssertAccess.
-- Row-level access: Contributor on the board with 'boards:create' (dbo.usp_Board_AssertAccess,
--   NOT_FOUND 50001, FORBIDDEN_ROW 50003). A duplicate column name on the same board is surfaced as
--   DUPLICATE 50005 before the filtered unique index (UQ_BoardColumn_Name) can raise 2601 as INTERNAL.
-- Entity app.BoardColumn. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardColumn_Create
    @BoardId     INT,
    @Name        NVARCHAR(60),
    @Category    VARCHAR(10),
    @WipLimit    INT = NULL,
    @ActorUserId INT
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

    BEGIN TRAN;

    DECLARE @BoardExists INT;
    SELECT @BoardExists = BoardId
    FROM app.Board WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardId = @BoardId AND IsDeleted = 0;
    IF @BoardExists IS NULL
        THROW 50001, N'NOT_FOUND:Board not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'boards:create';

    IF EXISTS (SELECT 1 FROM app.BoardColumn
               WHERE BoardId = @BoardId AND IsDeleted = 0 AND LTRIM(RTRIM([Name])) = @Name)
        THROW 50005, N'DUPLICATE:A column with this name already exists', 1;

    DECLARE @SortOrder INT =
        ISNULL((SELECT MAX(SortOrder) FROM app.BoardColumn
                WHERE BoardId = @BoardId AND IsDeleted = 0), 0) + 1;

    INSERT INTO app.BoardColumn (BoardId, [Name], Category, WipLimit, SortOrder, CreatedBy)
    VALUES (@BoardId, @Name, @Category, @WipLimit, @SortOrder, @ActorUserId);
    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.BoardColumn', CAST(@Id AS NVARCHAR(64)),
            (SELECT BoardColumnId, BoardId, [Name], Category, WipLimit, SortOrder
             FROM app.BoardColumn WHERE BoardColumnId = @Id
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
    WHERE BoardColumnId = @Id;
END;
GO
