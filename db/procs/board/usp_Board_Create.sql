-- usp_Board_Create — insert one app.Board with its starting columns; audits in-transaction; returns
-- the new board. One intention, so one audit row: the board, with its columns in AfterJson.
-- Row-level access: a project board needs Contributor on @ProjectId with 'boards:create'
--   (dbo.usp_Project_AssertAccess, FORBIDDEN_ROW 50003; Admin bypass). @ProjectId NULL creates a
--   standalone board, which any signed-in user may create (@AllowProjectless = 1) and whose creator
--   becomes its Manager (dbo.ufn_Board_AccessLevel).
-- @ColumnsJson is [{ name, category, wipLimit }]: the default names come from src/lib/messages.ts,
--   never from SQL, so they stay in one place and translate with the rest of the copy. Every value is
--   read as text and checked here, before the INSERT: a CHECK violation (error 547) or a failed
--   OPENJSON conversion would reach the user as INTERNAL instead of VALIDATION.
-- Entity app.Board. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Board_Create
    @ProjectId   INT            = NULL,
    @Name        NVARCHAR(200),
    @Description NVARCHAR(2000) = NULL,
    @ColumnsJson NVARCHAR(MAX),
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'boards:create', @AllowProjectless = 1;

    IF @Name IS NULL OR LEN(LTRIM(RTRIM(@Name))) = 0
        THROW 50004, N'VALIDATION:Enter a board name', 1;

    IF @ColumnsJson IS NULL OR ISJSON(@ColumnsJson) <> 1 OR LEFT(LTRIM(@ColumnsJson), 1) <> N'['
        THROW 50004, N'VALIDATION:Columns must be a JSON array', 1;
    IF EXISTS (SELECT 1 FROM OPENJSON(@ColumnsJson) WHERE [type] <> 5)
        THROW 50004, N'VALIDATION:Each column must be an object', 1;

    DECLARE @Columns TABLE (
        SortOrder INT NOT NULL PRIMARY KEY,
        [Name]    NVARCHAR(4000) NULL,
        Category  NVARCHAR(4000) NULL,
        WipLimit  NVARCHAR(4000) NULL
    );
    INSERT INTO @Columns (SortOrder, [Name], Category, WipLimit)
    SELECT CAST(j.[key] AS INT) + 1, c.[Name], c.Category, c.WipLimit
    FROM OPENJSON(@ColumnsJson) j
    CROSS APPLY OPENJSON(j.value)
        WITH ([Name]  NVARCHAR(4000) N'$.name',
              Category NVARCHAR(4000) N'$.category',
              WipLimit NVARCHAR(4000) N'$.wipLimit') c;

    IF NOT EXISTS (SELECT 1 FROM @Columns)
        THROW 50004, N'VALIDATION:A board needs at least one column', 1;
    IF (SELECT COUNT(*) FROM @Columns) > 12
        THROW 50004, N'VALIDATION:A board takes at most 12 columns', 1;
    IF EXISTS (SELECT 1 FROM @Columns
               WHERE [Name] IS NULL OR LEN(LTRIM(RTRIM([Name]))) = 0 OR LEN([Name]) > 60)
        THROW 50004, N'VALIDATION:Each column needs a name of up to 60 characters', 1;
    IF EXISTS (SELECT 1 FROM @Columns GROUP BY LTRIM(RTRIM([Name])) HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:Each column name can be used only once', 1;
    IF EXISTS (SELECT 1 FROM @Columns WHERE Category IS NULL OR Category NOT IN (N'todo', N'doing', N'done'))
        THROW 50004, N'VALIDATION:Each column is a to do, doing or done column', 1;
    IF EXISTS (SELECT 1 FROM @Columns
               WHERE WipLimit IS NOT NULL
                 AND (TRY_CAST(WipLimit AS INT) IS NULL OR TRY_CAST(WipLimit AS INT) NOT BETWEEN 1 AND 999))
        THROW 50004, N'VALIDATION:A work-in-progress limit is a number from 1 to 999', 1;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    BEGIN TRAN;

    INSERT INTO app.Board (ProjectId, [Name], [Description], CreatedBy)
    VALUES (@ProjectId, LTRIM(RTRIM(@Name)), @Description, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO app.BoardColumn (BoardId, [Name], Category, WipLimit, SortOrder, CreatedBy)
    SELECT @Id, LTRIM(RTRIM(c.[Name])), CAST(c.Category AS VARCHAR(10)),
           TRY_CAST(c.WipLimit AS INT), c.SortOrder, @ActorUserId
    FROM @Columns c;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Board', CAST(@Id AS NVARCHAR(64)),
            (SELECT b.BoardId, b.ProjectId, b.[Name], b.[Description],
                    Columns = (SELECT c.BoardColumnId, c.[Name], c.Category, c.WipLimit, c.SortOrder
                               FROM app.BoardColumn c
                               WHERE c.BoardId = b.BoardId
                               ORDER BY c.SortOrder
                               FOR JSON PATH, INCLUDE_NULL_VALUES)
             FROM app.Board b WHERE b.BoardId = @Id
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
           acc.AccessLevel AS ActorAccess
    FROM app.Board b
    CROSS APPLY dbo.ufn_Board_AccessLevel(@ActorRole, @ActorUserId, b.ProjectId, b.CreatedBy) acc
    LEFT JOIN app.Project p ON p.ProjectId = b.ProjectId
    WHERE b.BoardId = @Id;
END;
GO
