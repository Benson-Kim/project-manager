-- usp_KeyDeliverableRequirement_Move — put a requirement at @Position (from 1) among its item's
-- requirements and renumber the rest (migration 035, ADR-0036): Move up and Move down.
-- A position past the end puts it last.
-- Access: Manager on the item's project, or a per-person grant (key-deliverables:update, ADR-0024).
-- Rowversion concurrency on the moved requirement (CONFLICT 50002). Locks the project row first,
--   like every write to the breakdown (ADR-0027 §5). Audited in-transaction.
-- Returns the item's ProjectId.
-- Entity app.KeyDeliverableRequirement. Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverableRequirement_Move
    @KeyDeliverableRequirementId INT,
    @Position                    INT,
    @RowVer                      BIGINT,
    @ActorUserId                 INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT, @ItemId INT;
    SELECT @CurrentVer = CAST(r.RowVer AS BIGINT), @RowProjectId = kd.ProjectId,
           @ItemId = r.KeyDeliverableId
    FROM app.KeyDeliverableRequirement AS r
    JOIN app.KeyDeliverable AS kd ON kd.KeyDeliverableId = r.KeyDeliverableId AND kd.IsDeleted = 0
    WHERE r.KeyDeliverableRequirementId = @KeyDeliverableRequirementId AND r.IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:KeyDeliverableRequirement not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:update', @AllowProjectless = 0;

    IF @Position IS NULL OR @Position < 1
        THROW 50004, N'VALIDATION:Position must be 1 or more', 1;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:KeyDeliverableRequirement was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    IF NOT EXISTS (SELECT 1 FROM app.KeyDeliverableRequirement
                   WHERE KeyDeliverableRequirementId = @KeyDeliverableRequirementId AND IsDeleted = 0
                     AND CAST(RowVer AS BIGINT) = @RowVer)
        THROW 50002, N'CONFLICT:KeyDeliverableRequirement was modified by someone else', 1;

    -- The others in their current order, numbered around the moved one's new place.
    DECLARE @Order TABLE (Id INT PRIMARY KEY, Position INT NOT NULL);
    INSERT INTO @Order (Id, Position)
    SELECT KeyDeliverableRequirementId, ROW_NUMBER() OVER (ORDER BY SortOrder, KeyDeliverableRequirementId)
    FROM app.KeyDeliverableRequirement
    WHERE KeyDeliverableId = @ItemId AND IsDeleted = 0
      AND KeyDeliverableRequirementId <> @KeyDeliverableRequirementId;

    DECLARE @At INT = (SELECT COUNT(*) FROM @Order) + 1;
    IF @Position < @At SET @At = @Position;

    UPDATE @Order SET Position = Position + 1 WHERE Position >= @At;
    INSERT INTO @Order (Id, Position) VALUES (@KeyDeliverableRequirementId, @At);

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT KeyDeliverableRequirementId AS id, SortOrder FROM app.KeyDeliverableRequirement
         WHERE KeyDeliverableId = @ItemId AND IsDeleted = 0
         ORDER BY SortOrder, KeyDeliverableRequirementId FOR JSON PATH);

    UPDATE r SET
        SortOrder    = o.Position,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    FROM app.KeyDeliverableRequirement AS r
    JOIN @Order AS o ON o.Id = r.KeyDeliverableRequirementId
    WHERE r.SortOrder <> o.Position;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'ReorderRequirements', N'app.KeyDeliverable', CAST(@ItemId AS NVARCHAR(64)), @Before,
            (SELECT Id AS id, Position AS SortOrder FROM @Order ORDER BY Position FOR JSON PATH));

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
