-- usp_RequirementCanvas_Update — rename a canvas or change its filing (ADR-0061). Both values are
--   always sent: a NULL @KeyDeliverableId files it under no WBS item.
-- Access: Contributor + requirements:update. The project comes from the row. A stale @RowVer answers
--   409. Node writes leave the canvas row alone, so a drag never conflicts with a rename.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementCanvas_Update
    @RequirementCanvasId INT,
    @Name                NVARCHAR(200),
    @KeyDeliverableId    INT = NULL,
    @RowVer              BIGINT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @CurrentVer BIGINT, @OldName NVARCHAR(120), @OldFiling INT;
    SELECT @RowProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT),
           @OldName = Name, @OldFiling = KeyDeliverableId
    FROM app.RequirementCanvas
    WHERE RequirementCanvasId = @RequirementCanvasId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Canvas not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Canvas was modified by someone else', 1;

    SET @Name = TRIM(@Name);

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    EXEC dbo.usp_RequirementCanvas_AssertDetails
         @ProjectId = @RowProjectId, @RequirementCanvasId = @RequirementCanvasId,
         @Name = @Name, @KeyDeliverableId = @KeyDeliverableId;

    UPDATE app.RequirementCanvas SET
        Name             = @Name,
        KeyDeliverableId = @KeyDeliverableId,
        UpdatedAtUtc     = SYSUTCDATETIME(),
        UpdatedBy        = @ActorUserId
    WHERE RequirementCanvasId = @RequirementCanvasId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Canvas was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.RequirementCanvas',
            CAST(@RequirementCanvasId AS NVARCHAR(64)),
            (SELECT @OldName AS name, @OldFiling AS keyDeliverableId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
            (SELECT @Name AS name, @KeyDeliverableId AS keyDeliverableId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
