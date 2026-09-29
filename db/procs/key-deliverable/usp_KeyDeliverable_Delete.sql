-- usp_KeyDeliverable_Delete — soft delete with atomic rowversion concurrency + actor scope + in-transaction audit.
-- RowVer is included in the UPDATE predicate to eliminate the TOCTOU race (same fix as Update).
-- Actor project-scope: ProjectManagers may only delete deliverables in their assigned projects.
-- Entity app.KeyDeliverable (source: tblKeyRequirementsDeliverable). Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_Delete
    @KeyDeliverableId INT,
    @RowVer           BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;

    -- Actor project-scope: the actor must be assigned to the owning project.
    DECLARE @OwningProjectId INT =
        (SELECT ProjectId FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0);

    IF @OwningProjectId IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM app.ProjectAssignee
           WHERE ProjectId = @OwningProjectId AND UserId = @ActorUserId
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT KeyDeliverableId, [ProjectId], [KeyRequirement], [Deadline], [AssignedToStakeholderId], [Priority], [Status]
         FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic soft-delete: RowVer in the WHERE predicate eliminates the TOCTOU window.
    UPDATE app.KeyDeliverable SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE KeyDeliverableId = @KeyDeliverableId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.KeyDeliverable', CAST(@KeyDeliverableId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
