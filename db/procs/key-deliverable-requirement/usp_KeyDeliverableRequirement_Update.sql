-- usp_KeyDeliverableRequirement_Update — change a requirement's wording and whether it is met
-- (migration 035, ADR-0034). The item it belongs to never changes.
-- Access: Manager on the item's project, or a per-person grant (key-deliverables:update, ADR-0024).
-- Rowversion concurrency (CONFLICT 50002); a blank requirement is VALIDATION (50004). Locks the
--   project row first, like every write to the breakdown (ADR-0027 §5). Audited in-transaction.
-- Returns the item's ProjectId.
-- Entity app.KeyDeliverableRequirement. Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverableRequirement_Update
    @KeyDeliverableRequirementId INT,
    @Requirement                 NVARCHAR(4000),
    @IsMet                       BIT,
    @RowVer                      BIGINT,
    @ActorUserId                 INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT;
    SELECT @CurrentVer = CAST(r.RowVer AS BIGINT), @RowProjectId = kd.ProjectId
    FROM app.KeyDeliverableRequirement AS r
    JOIN app.KeyDeliverable AS kd ON kd.KeyDeliverableId = r.KeyDeliverableId AND kd.IsDeleted = 0
    WHERE r.KeyDeliverableRequirementId = @KeyDeliverableRequirementId AND r.IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:KeyDeliverableRequirement not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:update', @AllowProjectless = 0;

    IF NULLIF(LTRIM(RTRIM(@Requirement)), N'') IS NULL OR @IsMet IS NULL
        THROW 50004, N'VALIDATION:A requirement is required', 1;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:KeyDeliverableRequirement was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT Requirement, IsMet FROM app.KeyDeliverableRequirement
         WHERE KeyDeliverableRequirementId = @KeyDeliverableRequirementId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.KeyDeliverableRequirement SET
        Requirement  = LTRIM(RTRIM(@Requirement)),
        IsMet        = @IsMet,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE KeyDeliverableRequirementId = @KeyDeliverableRequirementId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:KeyDeliverableRequirement was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.KeyDeliverableRequirement',
            CAST(@KeyDeliverableRequirementId AS NVARCHAR(64)), @Before,
            (SELECT Requirement, IsMet FROM app.KeyDeliverableRequirement
             WHERE KeyDeliverableRequirementId = @KeyDeliverableRequirementId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
