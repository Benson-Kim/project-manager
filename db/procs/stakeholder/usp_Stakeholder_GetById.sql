-- usp_Stakeholder_GetById — fetch one active app.Stakeholder row; THROW 50001 when absent/soft-deleted.
-- Entity app.Stakeholder (source: tblStakeholders). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Stakeholder_GetById
    @StakeholderId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Stakeholder WHERE StakeholderId = @StakeholderId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Stakeholder not found', 1;

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
