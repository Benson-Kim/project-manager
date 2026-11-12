-- usp_Checklist_Create — a new, empty checklist in a project (ADR-0066).
-- Access: Contributor + checklists:create. Answers with the usp_Checklist_List columns.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Checklist_Create
    @ProjectId   INT,
    @Name        NVARCHAR(200),
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'checklists:create', @AllowProjectless = 0;

    SET @Name = TRIM(@Name);

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @ProjectId;

    EXEC dbo.usp_Checklist_AssertName @ProjectId = @ProjectId, @Name = @Name;

    INSERT INTO app.Checklist (ProjectId, Name, CreatedBy) VALUES (@ProjectId, @Name, @ActorUserId);
    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Checklist', CAST(@Id AS NVARCHAR(64)),
            (SELECT @Id AS checklistId, @ProjectId AS projectId, @Name AS name
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT ChecklistId, ProjectId, Name, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Checklist WHERE ChecklistId = @Id;
END;
GO
