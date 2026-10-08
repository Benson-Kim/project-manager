-- usp_Stakeholder_Create — insert one app.Stakeholder row; audits in-transaction; returns the new row.
-- Actor project-scope: @ActorUserId must be an assignee of @ProjectId (FORBIDDEN_ROW 50003).
-- Admin bypass: an Admin actor (role read from auth.User) skips the project-scope check (same pattern as Q&A procs).
-- Dropdown values (ADR-0022): CommunicationPreference and EngagementLevel must be live options of their lists (VALIDATION 50004),
--   and are stored as listed.
-- Entity app.Stakeholder (source: tblStakeholders). Module: stakeholders (#6).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Stakeholder_Create
    @ProjectId INT,
    @FirstName NVARCHAR(255),
    @LastName NVARCHAR(255) = NULL,
    @DepartmentOrganization NVARCHAR(255) = NULL,
    @ProjectRole NVARCHAR(255) = NULL,
    @RoleDescription NVARCHAR(255) = NULL,
    @PhoneNumber NVARCHAR(255) = NULL,
    @PhoneExt NVARCHAR(255) = NULL,
    @Mobile NVARCHAR(255) = NULL,
    @EmailAddress NVARCHAR(255) = NULL,
    @PhysicalLocation NVARCHAR(255) = NULL,
    @OrgTitle NVARCHAR(255) = NULL,
    @CommunicationPreference NVARCHAR(255) = NULL,
    @EngagementLevel NVARCHAR(255) = NULL,
    @AdditionalNotes NVARCHAR(MAX) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;
    IF @FirstName IS NULL OR LTRIM(RTRIM(@FirstName)) = N''
        THROW 50004, N'VALIDATION:FirstName is required', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @AllowProjectless = 0;

    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'stakeholder.communication-preference', @Label = @CommunicationPreference OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'stakeholder.engagement-level', @Label = @EngagementLevel OUTPUT;

    BEGIN TRAN;

    INSERT INTO app.Stakeholder ([ProjectId], [FirstName], [LastName], [DepartmentOrganization], [ProjectRole], [RoleDescription], [PhoneNumber], [PhoneExt], [Mobile], [EmailAddress], [PhysicalLocation], [OrgTitle], [CommunicationPreference], [EngagementLevel], [AdditionalNotes], CreatedBy)
    VALUES (@ProjectId, @FirstName, @LastName, @DepartmentOrganization, @ProjectRole, @RoleDescription, @PhoneNumber, @PhoneExt, @Mobile, @EmailAddress, @PhysicalLocation, @OrgTitle, @CommunicationPreference, @EngagementLevel, @AdditionalNotes, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Stakeholder', CAST(@Id AS NVARCHAR(64)),
            (SELECT StakeholderId, [ProjectId], [FirstName], [LastName], [DepartmentOrganization], [ProjectRole], [RoleDescription], [PhoneNumber], [PhoneExt], [Mobile], [EmailAddress], [PhysicalLocation], [OrgTitle], [CommunicationPreference], [EngagementLevel], [AdditionalNotes]
             FROM app.Stakeholder WHERE StakeholderId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

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
    WHERE StakeholderId = @Id;
END;
GO
