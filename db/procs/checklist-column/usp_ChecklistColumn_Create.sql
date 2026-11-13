-- usp_ChecklistColumn_Create — add a column at the end of a checklist (ADR-0066).
-- Access: Contributor + checklists:create. The project comes from the checklist.
-- The kind is fixed for the column's life; an action column names its action (sign off or to-do).
-- THROW 50004 VALIDATION : bad name, kind or action, or the checklist already has 30 columns.
-- THROW 50005 DUPLICATE  : another live column of the checklist has that name.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ChecklistColumn_Create
    @ChecklistId INT,
    @Name        NVARCHAR(200),
    @Kind        VARCHAR(20),
    @ActionKind  VARCHAR(20) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT =
        (SELECT ProjectId FROM app.Checklist WHERE ChecklistId = @ChecklistId AND IsDeleted = 0);
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Checklist not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'checklists:create', @AllowProjectless = 0;

    SET @Name = TRIM(@Name);
    IF @Name IS NULL OR LEN(@Name) = 0 OR LEN(@Name) > 80
        THROW 50004, N'VALIDATION:A column name has 1 to 80 characters', 1;
    IF @Kind IS NULL OR @Kind NOT IN ('date', 'text', 'document', 'action')
        THROW 50004, N'VALIDATION:Pick what the column holds', 1;
    IF (@Kind = 'action' AND (@ActionKind IS NULL OR @ActionKind NOT IN ('signoff', 'todo')))
       OR (@Kind <> 'action' AND @ActionKind IS NOT NULL)
        THROW 50004, N'VALIDATION:Pick what the button does', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ChecklistId FROM app.Checklist WITH (UPDLOCK, HOLDLOCK)
    WHERE ChecklistId = @ChecklistId AND IsDeleted = 0;
    IF @Locked IS NULL
        THROW 50001, N'NOT_FOUND:Checklist not found', 1;

    IF (SELECT COUNT(*) FROM app.ChecklistColumn WHERE ChecklistId = @ChecklistId AND IsDeleted = 0) >= 30
        THROW 50004, N'VALIDATION:A checklist has at most 30 columns', 1;
    IF EXISTS (SELECT 1 FROM app.ChecklistColumn
               WHERE ChecklistId = @ChecklistId AND Name = @Name AND IsDeleted = 0)
        THROW 50005, N'DUPLICATE:This checklist already has a column with that name', 1;

    DECLARE @Sort INT = 1 + ISNULL((SELECT MAX(SortOrder) FROM app.ChecklistColumn
                                    WHERE ChecklistId = @ChecklistId AND IsDeleted = 0), 0);

    INSERT INTO app.ChecklistColumn (ChecklistId, ProjectId, Name, Kind, ActionKind, SortOrder, CreatedBy)
    VALUES (@ChecklistId, @ProjectId, @Name, @Kind, @ActionKind, @Sort, @ActorUserId);
    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.ChecklistColumn', CAST(@Id AS NVARCHAR(64)),
            (SELECT @ChecklistId AS checklistId, @Name AS name, @Kind AS kind, @ActionKind AS actionKind
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT ChecklistColumnId, ChecklistId, Name, Kind, ActionKind, SortOrder,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ChecklistColumn WHERE ChecklistColumnId = @Id;
END;
GO
