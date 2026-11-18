-- usp_Whiteboard_Create — a new, empty whiteboard (migration 086).
-- Access: Contributor + whiteboard:create. Answers with the same columns as usp_Whiteboard_List.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Whiteboard_Create
    @ProjectId   INT,
    @Name        NVARCHAR(200),
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'whiteboard:create', @AllowProjectless = 0;

    SET @Name = TRIM(@Name);

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @ProjectId;

    EXEC dbo.usp_Whiteboard_AssertName @ProjectId = @ProjectId, @Name = @Name;

    INSERT INTO app.Whiteboard (ProjectId, Name, BoardJson, CreatedBy)
    VALUES (@ProjectId, @Name, N'{"version":1,"elements":[],"appState":{"viewBackgroundColor":"#ffffff"}}', @ActorUserId);
    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Whiteboard', CAST(@Id AS NVARCHAR(64)),
            (SELECT @Id AS whiteboardId, @ProjectId AS projectId, @Name AS name
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT WhiteboardId, Name, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Whiteboard
    WHERE WhiteboardId = @Id;
END;
GO
