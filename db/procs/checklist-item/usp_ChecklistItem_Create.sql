-- usp_ChecklistItem_Create — add a row at the end of a checklist (ADR-0066).
-- Access: Contributor + checklists:create. The project comes from the checklist.
-- THROW 50004 VALIDATION : empty or too long title, or the checklist already has 2,000 rows.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ChecklistItem_Create
    @ChecklistId INT,
    @Title       NVARCHAR(500),
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

    SET @Title = TRIM(@Title);
    IF @Title IS NULL OR LEN(@Title) = 0 OR LEN(@Title) > 400
        THROW 50004, N'VALIDATION:A row title has 1 to 400 characters', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ChecklistId FROM app.Checklist WITH (UPDLOCK, HOLDLOCK)
    WHERE ChecklistId = @ChecklistId AND IsDeleted = 0;
    IF @Locked IS NULL
        THROW 50001, N'NOT_FOUND:Checklist not found', 1;

    IF (SELECT COUNT(*) FROM app.ChecklistItem WHERE ChecklistId = @ChecklistId AND IsDeleted = 0) >= 2000
        THROW 50004, N'VALIDATION:A checklist has at most 2,000 rows', 1;

    DECLARE @Sort INT = 1 + ISNULL((SELECT MAX(SortOrder) FROM app.ChecklistItem
                                    WHERE ChecklistId = @ChecklistId AND IsDeleted = 0), 0);

    INSERT INTO app.ChecklistItem (ChecklistId, ProjectId, Title, SortOrder, CreatedBy)
    VALUES (@ChecklistId, @ProjectId, @Title, @Sort, @ActorUserId);
    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.ChecklistItem', CAST(@Id AS NVARCHAR(64)),
            (SELECT @ChecklistId AS checklistId, @Title AS title FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    SELECT * FROM dbo.ufn_ChecklistItem_Row(@ActorRole, @ActorUserId, @Id);
END;
GO
