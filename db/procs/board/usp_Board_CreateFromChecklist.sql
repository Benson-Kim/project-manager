-- usp_Board_CreateFromChecklist — make a board from one checklist in a single transaction: the board,
-- its starting columns, one card per item and, for Scrum, a planned first sprint holding the cards.
-- Row-level access: the checklist must be live and belong to @ProjectId (NOT_FOUND otherwise, so a
--   caller cannot read a checklist through another project's id), and the actor needs Contributor on
--   that project with 'boards:create' and Viewer with 'checklists:read', since the cards copy the
--   checklist (dbo.usp_Project_AssertAccess, FORBIDDEN_ROW 50003).
-- Each card takes the item's title (cut to the card's 300 characters), notes and due date. A done item
--   goes to the last column, which must be a done column; every other item goes to the first column.
--   The assignee is the user whose email matches the item's stakeholder and who can work on the
--   project; with no such user the card is unassigned. The columns carry no work-in-progress limit,
--   so a board built here always takes every item.
-- A Scrum sprint runs from the earliest item date (or today) to the latest, and at least two weeks.
-- Entity app.Board. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Board_CreateFromChecklist
    @ChecklistId INT,
    @ProjectId   INT,
    @Name        NVARCHAR(200),
    @Method      VARCHAR(10),
    @ColumnsJson NVARCHAR(MAX),
    @SprintName  NVARCHAR(100) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Checklist
                   WHERE ChecklistId = @ChecklistId AND ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Checklist not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'boards:create', @AllowProjectless = 0;
    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @Permission = N'checklists:read', @AllowProjectless = 0;

    SET @Name = LTRIM(RTRIM(@Name));
    IF @Name IS NULL OR LEN(@Name) = 0 OR LEN(@Name) > 200
        THROW 50004, N'VALIDATION:Enter a board name', 1;
    IF @Method IS NULL OR @Method NOT IN ('kanban', 'scrum')
        THROW 50004, N'VALIDATION:Choose Kanban or Scrum', 1;
    SET @SprintName = LTRIM(RTRIM(@SprintName));
    IF @Method = 'scrum' AND (@SprintName IS NULL OR LEN(@SprintName) = 0 OR LEN(@SprintName) > 100)
        THROW 50004, N'VALIDATION:A sprint needs a name of up to 100 characters', 1;

    IF @ColumnsJson IS NULL OR ISJSON(@ColumnsJson) <> 1 OR LEFT(LTRIM(@ColumnsJson), 1) <> N'['
        THROW 50004, N'VALIDATION:Columns must be a JSON array', 1;
    IF EXISTS (SELECT 1 FROM OPENJSON(@ColumnsJson) WHERE [type] <> 5)
        THROW 50004, N'VALIDATION:Each column must be an object', 1;

    DECLARE @Columns TABLE (
        SortOrder INT NOT NULL PRIMARY KEY,
        [Name]    NVARCHAR(4000) NULL,
        Category  NVARCHAR(4000) NULL
    );
    INSERT INTO @Columns (SortOrder, [Name], Category)
    SELECT CAST(j.[key] AS INT) + 1, c.[Name], c.Category
    FROM OPENJSON(@ColumnsJson) j
    CROSS APPLY OPENJSON(j.value)
        WITH ([Name] NVARCHAR(4000) N'$.name', Category NVARCHAR(4000) N'$.category') c;

    DECLARE @ColumnCount INT = (SELECT COUNT(*) FROM @Columns);
    IF @ColumnCount < 2 OR @ColumnCount > 12
        THROW 50004, N'VALIDATION:A board made from a checklist takes 2 to 12 columns', 1;
    IF EXISTS (SELECT 1 FROM @Columns
               WHERE [Name] IS NULL OR LEN(LTRIM(RTRIM([Name]))) = 0 OR LEN([Name]) > 60)
        THROW 50004, N'VALIDATION:Each column needs a name of up to 60 characters', 1;
    IF EXISTS (SELECT 1 FROM @Columns GROUP BY LTRIM(RTRIM([Name])) HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:Each column name can be used only once', 1;
    IF EXISTS (SELECT 1 FROM @Columns WHERE Category IS NULL OR Category NOT IN (N'todo', N'doing', N'done'))
        THROW 50004, N'VALIDATION:Each column is a to do, doing or done column', 1;
    IF (SELECT Category FROM @Columns WHERE SortOrder = @ColumnCount) <> N'done'
        THROW 50004, N'VALIDATION:The last column must be a done column', 1;

    DECLARE @Items TABLE (
        Position   INT NOT NULL PRIMARY KEY,
        Title      NVARCHAR(300) NOT NULL,
        Notes      NVARCHAR(MAX) NULL,
        IsDone     BIT NOT NULL,
        StartDate  DATE NULL,
        DueDate    DATE NULL,
        AssigneeId INT NULL
    );
    INSERT INTO @Items (Position, Title, Notes, IsDone, StartDate, DueDate, AssigneeId)
    SELECT ROW_NUMBER() OVER (ORDER BY i.SortOrder, i.ChecklistItemId),
           LEFT(LTRIM(RTRIM(i.Title)), 300), i.Notes, i.IsDone, i.StartDate, i.DueDate, who.UserId
    FROM app.ChecklistItem i
    LEFT JOIN app.Stakeholder s ON s.StakeholderId = i.AssigneeStakeholderId
    OUTER APPLY (
        SELECT TOP (1) u.UserId
        FROM auth.[User] u
        JOIN auth.Role r ON r.RoleId = u.RoleId
        CROSS APPLY dbo.ufn_AccessLevel_Resolve(r.[Name], u.UserId, @ProjectId, 1) a
        WHERE s.EmailAddress IS NOT NULL
          AND u.Email = s.EmailAddress
          AND u.IsActive = 1 AND u.IsDeleted = 0
          AND a.AccessLevel IS NOT NULL
        ORDER BY u.UserId) who
    WHERE i.ChecklistId = @ChecklistId AND i.ProjectId = @ProjectId AND i.IsDeleted = 0
      AND LEN(LTRIM(RTRIM(i.Title))) > 0;

    DECLARE @Today DATE = CAST(SYSUTCDATETIME() AS DATE);
    DECLARE @SprintStart DATE = ISNULL(
        (SELECT MIN(v.d) FROM @Items CROSS APPLY (VALUES (StartDate), (DueDate)) v(d)), @Today);
    DECLARE @SprintEnd DATE =
        (SELECT MAX(v.d) FROM @Items CROSS APPLY (VALUES (StartDate), (DueDate)) v(d));
    IF @SprintEnd IS NULL OR @SprintEnd < DATEADD(DAY, 13, @SprintStart)
        SET @SprintEnd = DATEADD(DAY, 13, @SprintStart);

    BEGIN TRAN;

    INSERT INTO app.Board (ProjectId, [Name], CreatedBy)
    VALUES (@ProjectId, @Name, @ActorUserId);
    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO app.BoardColumn (BoardId, [Name], Category, WipLimit, SortOrder, CreatedBy)
    SELECT @Id, LTRIM(RTRIM(c.[Name])), CAST(c.Category AS VARCHAR(10)), NULL, c.SortOrder, @ActorUserId
    FROM @Columns c;

    DECLARE @FirstColumnId INT =
        (SELECT BoardColumnId FROM app.BoardColumn WHERE BoardId = @Id AND SortOrder = 1);
    DECLARE @DoneColumnId INT =
        (SELECT BoardColumnId FROM app.BoardColumn WHERE BoardId = @Id AND SortOrder = @ColumnCount);

    DECLARE @SprintId INT = NULL;
    IF @Method = 'scrum'
    BEGIN
        INSERT INTO app.BoardSprint (BoardId, [Name], StartDate, EndDate, [State], CreatedBy)
        VALUES (@Id, @SprintName, @SprintStart, @SprintEnd, 'planned', @ActorUserId);
        SET @SprintId = SCOPE_IDENTITY();
    END;

    INSERT INTO app.BoardCard (BoardId, BoardColumnId, BoardSprintId, Title, Notes,
                               AssigneeUserId, DueDate, SortKey, CreatedBy)
    SELECT @Id, CASE WHEN i.IsDone = 1 THEN @DoneColumnId ELSE @FirstColumnId END, @SprintId,
           i.Title, i.Notes, i.AssigneeId, i.DueDate, CAST(i.Position AS BIGINT) * 1048576, @ActorUserId
    FROM @Items i;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Board', CAST(@Id AS NVARCHAR(64)),
            (SELECT b.BoardId, b.ProjectId, b.[Name], FromChecklistId = @ChecklistId, Method = @Method,
                    BoardSprintId = @SprintId,
                    CardCount = (SELECT COUNT(*) FROM app.BoardCard c WHERE c.BoardId = b.BoardId),
                    Columns = (SELECT c.BoardColumnId, c.[Name], c.Category, c.SortOrder
                               FROM app.BoardColumn c
                               WHERE c.BoardId = b.BoardId
                               ORDER BY c.SortOrder
                               FOR JSON PATH, INCLUDE_NULL_VALUES)
             FROM app.Board b WHERE b.BoardId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

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
