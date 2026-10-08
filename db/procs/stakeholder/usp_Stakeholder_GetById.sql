-- usp_Stakeholder_GetById — fetch one active app.Stakeholder row; THROW 50001 when absent/soft-deleted.
-- Actor project-scope: @ActorUserId must be an assignee of the owning project (FORBIDDEN_ROW 50003).
-- Admin bypass: @ActorRole = N'Admin' skips the project-scope check.
-- Entity app.Stakeholder (source: tblStakeholders). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Stakeholder_GetById
    @StakeholderId INT,
    @ActorUserId   INT,
    @ActorRole     NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Stakeholder WHERE StakeholderId = @StakeholderId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Stakeholder not found', 1;

    -- Actor project-scope: the actor must be assigned to the owning project. Admins bypass.
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.Stakeholder s
           JOIN app.ProjectAssignee pa ON pa.ProjectId = s.ProjectId AND pa.UserId = @ActorUserId
                                      AND pa.IsDeleted = 0
           WHERE s.StakeholderId = @StakeholderId AND s.IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

    SELECT StakeholderId,
           [ProjectId],
           [FirstName],
           [LastName],
           [DepartmentOrganization],
           [ProjectRole],
           [RoleDescription],
           [PhoneNumber],
           [PhoneExt],
           [Mobile],
           [EmailAddress],
           [PhysicalLocation],
           [OrgTitle],
           [CommunicationPreference],
           [EngagementLevel],
           [AdditionalNotes],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Stakeholder
    WHERE StakeholderId = @StakeholderId AND IsDeleted = 0;
END;
GO
