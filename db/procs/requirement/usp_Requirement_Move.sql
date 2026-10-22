-- usp_Requirement_Move — put one requirement at @Position under one deliverable and renumber that
-- deliverable's list 1..n (ADR-0037). The cascade's up and down arrows.
-- Access: Contributor + requirements:update. @RowVer is the allocation's, not the requirement's.
-- Audited as a reorder of the deliverable, like the 035 move. Answers with the project id so the
--   editor can read the whole breakdown back.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_Move
    @RequirementId    INT,
    @KeyDeliverableId INT,
    @Position         INT,
    @RowVer           BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT;
    SELECT @CurrentVer = CAST(d.RowVer AS BIGINT), @RowProjectId = d.ProjectId
    FROM app.RequirementDeliverable AS d
    JOIN app.Requirement AS r ON r.RequirementId = d.RequirementId AND r.IsDeleted = 0
    JOIN app.KeyDeliverable AS kd ON kd.KeyDeliverableId = d.KeyDeliverableId AND kd.IsDeleted = 0
    WHERE d.RequirementId = @RequirementId AND d.KeyDeliverableId = @KeyDeliverableId;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Requirement is not on this deliverable', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    IF @Position IS NULL OR @Position < 1
        THROW 50004, N'VALIDATION:Position must be 1 or more', 1;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Requirement was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    IF NOT EXISTS (SELECT 1 FROM app.RequirementDeliverable
                   WHERE RequirementId = @RequirementId AND KeyDeliverableId = @KeyDeliverableId
                     AND CAST(RowVer AS BIGINT) = @RowVer)
        THROW 50002, N'CONFLICT:Requirement was modified by someone else', 1;

    DECLARE @Order TABLE (RequirementId INT PRIMARY KEY, Position INT NOT NULL);
    INSERT INTO @Order (RequirementId, Position)
    SELECT RequirementId, ROW_NUMBER() OVER (ORDER BY SortOrder, RequirementId)
    FROM app.RequirementDeliverable
    WHERE KeyDeliverableId = @KeyDeliverableId
      AND RequirementId <> @RequirementId;

    DECLARE @At INT = (SELECT COUNT(*) FROM @Order) + 1;
    IF @Position < @At SET @At = @Position;

    UPDATE @Order SET Position = Position + 1 WHERE Position >= @At;
    INSERT INTO @Order (RequirementId, Position) VALUES (@RequirementId, @At);

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT RequirementId AS id, SortOrder FROM app.RequirementDeliverable
         WHERE KeyDeliverableId = @KeyDeliverableId
         ORDER BY SortOrder, RequirementId FOR JSON PATH);

    UPDATE d SET
        SortOrder = o.Position
    FROM app.RequirementDeliverable AS d
    JOIN @Order AS o ON o.RequirementId = d.RequirementId
    WHERE d.KeyDeliverableId = @KeyDeliverableId
      AND d.SortOrder <> o.Position;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'ReorderRequirements', N'app.KeyDeliverable',
            CAST(@KeyDeliverableId AS NVARCHAR(64)), @Before,
            (SELECT RequirementId AS id, Position AS SortOrder FROM @Order ORDER BY Position FOR JSON PATH));

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
