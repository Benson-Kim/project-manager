-- usp_RequirementCanvas_Create — a new, empty canvas, optionally filed under one WBS item (ADR-0061).
-- Access: Contributor + requirements:create. Answers with the same columns as usp_RequirementCanvas_List.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementCanvas_Create
    @ProjectId        INT,
    @Name             NVARCHAR(200),
    @KeyDeliverableId INT = NULL,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:create', @AllowProjectless = 0;

    SET @Name = TRIM(@Name);

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @ProjectId;

    EXEC dbo.usp_RequirementCanvas_AssertDetails
         @ProjectId = @ProjectId, @Name = @Name, @KeyDeliverableId = @KeyDeliverableId;

    INSERT INTO app.RequirementCanvas (ProjectId, KeyDeliverableId, Name, CreatedBy)
    VALUES (@ProjectId, @KeyDeliverableId, @Name, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.RequirementCanvas', CAST(@Id AS NVARCHAR(64)),
            (SELECT @Id AS requirementCanvasId, @ProjectId AS projectId, @Name AS name,
                    @KeyDeliverableId AS keyDeliverableId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT RequirementCanvasId, Name, KeyDeliverableId, CAST(0 AS INT) AS NodeCount,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.RequirementCanvas
    WHERE RequirementCanvasId = @Id;
END;
GO
