-- usp_Stakeholder_GetById — fetch one active app.Stakeholder row; THROW 50001 when absent/soft-deleted.
-- Row-level access via dbo.usp_Project_AssertAccess: NOT_FOUND (50001) vs FORBIDDEN_ROW (50003);
--   Admin bypass; project-less rows are refused for non-Admins.
-- Entity app.Stakeholder (source: tblStakeholders). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Stakeholder_GetById
    @StakeholderId INT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Stakeholder WHERE StakeholderId = @StakeholderId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Stakeholder not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

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
