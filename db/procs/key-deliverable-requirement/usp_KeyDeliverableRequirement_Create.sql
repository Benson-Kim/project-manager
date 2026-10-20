-- usp_KeyDeliverableRequirement_Create — add a requirement at the end of a deliverable's
-- requirements (migration 035, ADR-0034). Audited in-transaction.
-- Access: Manager on the item's project, or a per-person grant (key-deliverables:create, ADR-0024).
-- The item must be live (NOT_FOUND 50001); a blank requirement is VALIDATION (50004).
-- Like every write to the breakdown, it locks the project row first, so usp_KeyDeliverable_GanttData's
--   stamp follows commit order (ADR-0027 §5).
-- Returns the new KeyDeliverableRequirementId and the item's ProjectId.
-- Entity app.KeyDeliverableRequirement. Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverableRequirement_Create
    @KeyDeliverableId INT,
    @Requirement      NVARCHAR(4000),
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId
    FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:create', @AllowProjectless = 0;

    IF NULLIF(LTRIM(RTRIM(@Requirement)), N'') IS NULL
        THROW 50004, N'VALIDATION:A requirement is required', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    IF NOT EXISTS (SELECT 1 FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;

    DECLARE @Position INT =
        ISNULL((SELECT MAX(SortOrder) FROM app.KeyDeliverableRequirement
                WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0), 0) + 1;

    INSERT INTO app.KeyDeliverableRequirement (KeyDeliverableId, Requirement, SortOrder, CreatedBy)
    VALUES (@KeyDeliverableId, LTRIM(RTRIM(@Requirement)), @Position, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.KeyDeliverableRequirement', CAST(@Id AS NVARCHAR(64)),
            (SELECT KeyDeliverableRequirementId, KeyDeliverableId, Requirement, IsMet, SortOrder
             FROM app.KeyDeliverableRequirement WHERE KeyDeliverableRequirementId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @Id AS KeyDeliverableRequirementId, @RowProjectId AS ProjectId;
END;
GO
