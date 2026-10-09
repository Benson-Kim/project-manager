-- usp_Stakeholder_Update — full-row update with atomic rowversion concurrency (50002 CONFLICT),
--   actor project-scope guard (50003 FORBIDDEN_ROW), and in-transaction audit.
-- RowVer is included in the UPDATE predicate (not pre-checked) to eliminate the TOCTOU race
--   where two requests pass the pre-check before either write completes.
-- Row-level access: the actor needs Manager on the row's project (dbo.usp_Project_AssertAccess,
--   ADR-0021; FORBIDDEN_ROW 50003). Admins hold Manager everywhere.
-- The project key is immutable: @ProjectId is accepted but ignored (DB standard).
-- Dropdown values (ADR-0022): CommunicationPreference and EngagementLevel must be live options of their lists, or unchanged (VALIDATION 50004),
--   and are stored as listed.
-- Entity app.Stakeholder (source: tblStakeholders). Module: stakeholders (#6).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Stakeholder_Update
    @StakeholderId INT,
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
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Verify the row exists (NOT_FOUND) before entering the transaction so we
    -- give a useful error even when RowVer is stale.
    DECLARE @RowProjectId INT, @CurrentCommunication NVARCHAR(255), @CurrentEngagement NVARCHAR(255);
    SELECT @RowProjectId = ProjectId, @CurrentCommunication = CommunicationPreference,
           @CurrentEngagement = EngagementLevel
    FROM app.Stakeholder WHERE StakeholderId = @StakeholderId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Stakeholder not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'stakeholders:update', @AllowProjectless = 0;
    SET @ProjectId = @RowProjectId;

    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'stakeholder.communication-preference', @Label = @CommunicationPreference OUTPUT,
         @CurrentLabel = @CurrentCommunication;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'stakeholder.engagement-level', @Label = @EngagementLevel OUTPUT,
         @CurrentLabel = @CurrentEngagement;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT StakeholderId, [ProjectId], [FirstName], [LastName], [DepartmentOrganization], [ProjectRole], [RoleDescription], [PhoneNumber], [PhoneExt], [Mobile], [EmailAddress], [PhysicalLocation], [OrgTitle], [CommunicationPreference], [EngagementLevel], [AdditionalNotes]
         FROM app.Stakeholder WHERE StakeholderId = @StakeholderId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic update: RowVer in the WHERE predicate eliminates the TOCTOU window.
    -- If @@ROWCOUNT = 0 the row was modified concurrently (or disappeared).
    UPDATE app.Stakeholder SET
        [ProjectId] = @ProjectId,
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [DepartmentOrganization] = @DepartmentOrganization,
        [ProjectRole] = @ProjectRole,
        [RoleDescription] = @RoleDescription,
        [PhoneNumber] = @PhoneNumber,
        [PhoneExt] = @PhoneExt,
        [Mobile] = @Mobile,
        [EmailAddress] = @EmailAddress,
        [PhysicalLocation] = @PhysicalLocation,
        [OrgTitle] = @OrgTitle,
        [CommunicationPreference] = @CommunicationPreference,
        [EngagementLevel] = @EngagementLevel,
        [AdditionalNotes] = @AdditionalNotes,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE StakeholderId = @StakeholderId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Stakeholder was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Stakeholder', CAST(@StakeholderId AS NVARCHAR(64)), @Before,
            (SELECT StakeholderId, [ProjectId], [FirstName], [LastName], [DepartmentOrganization], [ProjectRole], [RoleDescription], [PhoneNumber], [PhoneExt], [Mobile], [EmailAddress], [PhysicalLocation], [OrgTitle], [CommunicationPreference], [EngagementLevel], [AdditionalNotes]
             FROM app.Stakeholder WHERE StakeholderId = @StakeholderId
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
    WHERE StakeholderId = @StakeholderId;
END;
GO
