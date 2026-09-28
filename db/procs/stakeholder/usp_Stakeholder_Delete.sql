-- usp_Stakeholder_Delete — soft delete with atomic rowversion concurrency + in-transaction audit.
-- RowVer is included in the UPDATE predicate to eliminate the TOCTOU race.
-- FORBIDDEN_ROW check: actor must be assigned to the row's project.
-- Entity app.Stakeholder (source: tblStakeholders). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Stakeholder_Delete
    @StakeholderId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Stakeholder WHERE StakeholderId = @StakeholderId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Stakeholder not found', 1;

    -- Row-level access: actor must be assigned to the project that owns this record.
    IF NOT EXISTS (
        SELECT 1
        FROM app.Stakeholder s
        JOIN app.ProjectAssignee pa ON pa.ProjectId = s.ProjectId AND pa.UserId = @ActorUserId
        WHERE s.StakeholderId = @StakeholderId AND s.IsDeleted = 0
    )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT StakeholderId, [ProjectId], [FirstName], [LastName], [DepartmentOrganization], [ProjectRole], [RoleDescription], [PhoneNumber], [PhoneExt], [Mobile], [EmailAddress], [PhysicalLocation], [OrgTitle], [CommunicationPreference], [EngagementLevel], [AdditionalNotes]
         FROM app.Stakeholder WHERE StakeholderId = @StakeholderId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic soft-delete: RowVer in the WHERE predicate.
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
