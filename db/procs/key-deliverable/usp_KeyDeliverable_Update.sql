-- usp_KeyDeliverable_Update — full-row update with atomic rowversion concurrency (50002 CONFLICT),
--   actor project-scope guard (50003 FORBIDDEN_ROW), and assignee project-scope check.
-- RowVer is included in the UPDATE predicate (not pre-checked) to eliminate the TOCTOU race
--   where two requests pass the pre-check before either write completes.
-- Entity app.KeyDeliverable (source: tblKeyRequirementsDeliverable). Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_Update
    @KeyDeliverableId          INT,
    @ProjectId                 INT = NULL,
    @KeyRequirement            NVARCHAR(MAX) = NULL,
    @Deadline                  DATETIME2 = NULL,
    @AssignedToStakeholderId   INT = NULL,
    @Priority                  NVARCHAR(255) = NULL,
    @Status                    NVARCHAR(255) = NULL,
    @RowVer                    BIGINT,
    @ActorUserId               INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Verify the row exists (NOT_FOUND) before entering the transaction so we
    -- give a useful error even when RowVer is stale.
    IF NOT EXISTS (SELECT 1 FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;

    -- Actor project-scope: ProjectManagers may only update deliverables that belong to
    -- one of their assigned projects (FORBIDDEN_ROW 50003).
    DECLARE @OwningProjectId INT =
        (SELECT ProjectId FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0);

    IF @OwningProjectId IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM app.ProjectAssignee
           WHERE ProjectId = @OwningProjectId AND UserId = @ActorUserId
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

    -- Assignee project-scope: the stakeholder must belong to the target project.
    IF @AssignedToStakeholderId IS NOT NULL
       AND @ProjectId IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM app.Stakeholder
           WHERE StakeholderId = @AssignedToStakeholderId
             AND ProjectId = @ProjectId
             AND IsDeleted = 0
       )
        THROW 50004, N'VALIDATION:Assignee does not belong to this project', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT KeyDeliverableId, [ProjectId], [KeyRequirement], [Deadline], [AssignedToStakeholderId], [Priority], [Status]
         FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic update: RowVer in the WHERE predicate eliminates the TOCTOU window.
    -- If @@ROWCOUNT = 0 the row was modified concurrently (or disappeared).
    UPDATE app.KeyDeliverable SET
        [ProjectId]                = @ProjectId,
        [KeyRequirement]           = @KeyRequirement,
        [Deadline]                 = @Deadline,
        [AssignedToStakeholderId]  = @AssignedToStakeholderId,
        [Priority]                 = @Priority,
        [Status]                   = @Status,
        UpdatedAtUtc               = SYSUTCDATETIME(),
        UpdatedBy                  = @ActorUserId
    WHERE KeyDeliverableId = @KeyDeliverableId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.KeyDeliverable', CAST(@KeyDeliverableId AS NVARCHAR(64)), @Before,
            (SELECT KeyDeliverableId, [ProjectId], [KeyRequirement], [Deadline], [AssignedToStakeholderId], [Priority], [Status]
             FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT KeyDeliverableId,
           [ProjectId],
           [KeyRequirement],
           [Deadline],
           [AssignedToStakeholderId],
           [Priority],
           [Status],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.KeyDeliverable
    WHERE KeyDeliverableId = @KeyDeliverableId;
END;
GO
