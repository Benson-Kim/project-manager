-- usp_KeyDeliverable_Create — insert one app.KeyDeliverable row; audits in-transaction; returns the new row.
-- Actor project-scope: @ActorUserId must be an assignee of @ProjectId (FORBIDDEN_ROW 50003).
-- Assignee project-scope: @AssignedToStakeholderId must belong to @ProjectId (VALIDATION 50004).
-- Entity app.KeyDeliverable (source: tblKeyRequirementsDeliverable). Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_Create
    @ProjectId                 INT = NULL,
    @KeyRequirement            NVARCHAR(MAX) = NULL,
    @Deadline                  DATETIME2 = NULL,
    @AssignedToStakeholderId   INT = NULL,
    @Priority                  NVARCHAR(255) = NULL,
    @Status                    NVARCHAR(255) = NULL,
    @ActorUserId               INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Actor project-scope: the actor must be assigned to the project they are writing into.
    -- Admin users bypass this via the action-layer RBAC check (role = Admin → all permissions).
    -- ProjectManagers are checked here so a PM cannot write to a project they are not on.
    IF @ProjectId IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM app.ProjectAssignee
           WHERE ProjectId = @ProjectId AND UserId = @ActorUserId
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

    -- Assignee project-scope: the stakeholder must belong to the target project.
    -- This prevents cross-project assignments that appear valid via the FK alone.
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

    INSERT INTO app.KeyDeliverable ([ProjectId], [KeyRequirement], [Deadline], [AssignedToStakeholderId], [Priority], [Status], CreatedBy)
    VALUES (@ProjectId, @KeyRequirement, @Deadline, @AssignedToStakeholderId, @Priority, @Status, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.KeyDeliverable', CAST(@Id AS NVARCHAR(64)),
            (SELECT KeyDeliverableId, [ProjectId], [KeyRequirement], [Deadline], [AssignedToStakeholderId], [Priority], [Status]
             FROM app.KeyDeliverable WHERE KeyDeliverableId = @Id
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
    WHERE KeyDeliverableId = @Id;
END;
GO
