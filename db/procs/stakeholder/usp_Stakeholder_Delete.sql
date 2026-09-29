-- usp_Stakeholder_Delete — soft delete with atomic rowversion concurrency + actor scope + in-transaction audit.
-- RowVer is included in the UPDATE predicate to eliminate the TOCTOU race (same fix as Update).
-- Actor project-scope: ProjectManagers may only delete stakeholders in their assigned projects.
-- Admin bypass: @ActorRole = N'Admin' skips the project-scope check (same pattern as Q&A procs).
-- Entity app.Stakeholder (source: tblStakeholders). Module: stakeholders (#6).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Stakeholder_Delete
    @StakeholderId INT,
    @RowVer BIGINT,
    @ActorUserId INT,
    @ActorRole NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Stakeholder WHERE StakeholderId = @StakeholderId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Stakeholder not found', 1;

    -- Actor project-scope: the actor must be assigned to the owning project.
    -- Admin role bypasses this check.
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.Stakeholder s
           JOIN app.ProjectAssignee pa ON pa.ProjectId = s.ProjectId AND pa.UserId = @ActorUserId
                                      AND pa.IsDeleted = 0
           WHERE s.StakeholderId = @StakeholderId AND s.IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT StakeholderId, [ProjectId], [FirstName], [LastName], [DepartmentOrganization], [ProjectRole], [RoleDescription], [PhoneNumber], [PhoneExt], [Mobile], [EmailAddress], [PhysicalLocation], [OrgTitle], [CommunicationPreference], [EngagementLevel], [AdditionalNotes]
         FROM app.Stakeholder WHERE StakeholderId = @StakeholderId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic soft-delete: RowVer in the WHERE predicate eliminates the TOCTOU window.
    UPDATE app.Stakeholder SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE StakeholderId = @StakeholderId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Stakeholder was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.Stakeholder', CAST(@StakeholderId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
