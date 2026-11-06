-- usp_Stakeholder_Create — insert one app.Stakeholder row; audits in-transaction; returns the new row.
-- Actor project-scope: @ActorUserId must be an assignee of @ProjectId (FORBIDDEN_ROW 50003).
-- Admin bypass: an Admin actor (role read from auth.User) skips the project-scope check (same pattern as Q&A procs).
-- Dropdown values (ADR-0022): CommunicationPreference, EngagementLevel, CommunicationPurpose and
--   CommunicationFrequency must be live options of their lists (VALIDATION 50004),
--   and are stored as listed.
-- Entity app.Stakeholder (source: tblStakeholders). Module: stakeholders (#6).
-- Power, Interest and Stance (migration 066) place the row on the stakeholder matrix: 0 to 100,
--   and one of the five stances (VALIDATION 50004). NULL leaves it unplaced or unset.
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
    @CommunicationPurpose NVARCHAR(50) = NULL,
    @KeyMessageStrategy NVARCHAR(MAX) = NULL,
    @CommunicationFrequency NVARCHAR(50) = NULL,
    @AdditionalNotes NVARCHAR(MAX) = NULL,
    @Power INT = NULL,
    @Interest INT = NULL,
    @Stance NVARCHAR(20) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Power NOT BETWEEN 0 AND 100 OR @Interest NOT BETWEEN 0 AND 100
        THROW 50004, N'VALIDATION:Power and Interest are 0 to 100', 1;
    IF @Stance COLLATE Latin1_General_BIN2 NOT IN (N'Champion', N'Supporter', N'Neutral', N'Critic', N'Blocker')
        THROW 50004, N'VALIDATION:Stance is not a known stance', 1;

    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;
    IF @FirstName IS NULL OR LTRIM(RTRIM(@FirstName)) = N''
        THROW 50004, N'VALIDATION:FirstName is required', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'stakeholders:create', @AllowProjectless = 0;

    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'stakeholder.communication-preference', @Label = @CommunicationPreference OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'stakeholder.engagement-level', @Label = @EngagementLevel OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'stakeholder.communication-purpose', @Label = @CommunicationPurpose OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'stakeholder.communication-frequency', @Label = @CommunicationFrequency OUTPUT;

    BEGIN TRAN;

    INSERT INTO app.Stakeholder ([ProjectId], [FirstName], [LastName], [DepartmentOrganization], [ProjectRole], [RoleDescription], [PhoneNumber], [PhoneExt], [Mobile], [EmailAddress], [PhysicalLocation], [OrgTitle], [CommunicationPreference], [EngagementLevel], [CommunicationPurpose], [KeyMessageStrategy], [CommunicationFrequency], [AdditionalNotes], [Power], [Interest], [Stance], CreatedBy)
    VALUES (@ProjectId, @FirstName, @LastName, @DepartmentOrganization, @ProjectRole, @RoleDescription, @PhoneNumber, @PhoneExt, @Mobile, @EmailAddress, @PhysicalLocation, @OrgTitle, @CommunicationPreference, @EngagementLevel, @CommunicationPurpose, @KeyMessageStrategy, @CommunicationFrequency, @AdditionalNotes, @Power, @Interest, @Stance, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Stakeholder', CAST(@Id AS NVARCHAR(64)),
            (SELECT StakeholderId, [ProjectId], [FirstName], [LastName], [DepartmentOrganization], [ProjectRole], [RoleDescription], [PhoneNumber], [PhoneExt], [Mobile], [EmailAddress], [PhysicalLocation], [OrgTitle], [CommunicationPreference], [EngagementLevel], [CommunicationPurpose], [KeyMessageStrategy], [CommunicationFrequency], [AdditionalNotes], [Power], [Interest], [Stance]
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
           [CommunicationPurpose],
           [KeyMessageStrategy],
           [CommunicationFrequency],
           [AdditionalNotes],
           [Power],
           [Interest],
           [Stance],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Stakeholder
    WHERE StakeholderId = @Id;
END;
GO
