-- usp_Stakeholder_Create — insert one app.Stakeholder row; audits in-transaction; returns the new row.
-- Actor project-scope: @ActorUserId must be an assignee of @ProjectId (FORBIDDEN_ROW 50003).
-- Admin bypass: @ActorRole = N'Admin' skips the project-scope check (same pattern as Q&A procs).
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
    @ActorUserId INT,
    @ActorRole NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;
    IF @FirstName IS NULL OR LTRIM(RTRIM(@FirstName)) = N''
        THROW 50004, N'VALIDATION:FirstName is required', 1;

    -- Row-level access: the actor must be assigned to the project they are writing into.
    -- Admins bypass this check — they have full access to all projects.
    IF @ActorRole <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.ProjectAssignee
           WHERE ProjectId = @ProjectId AND UserId = @ActorUserId
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

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
