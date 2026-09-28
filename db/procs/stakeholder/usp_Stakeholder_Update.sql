-- usp_Stakeholder_Update — full-row update with atomic rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- RowVer is included in the UPDATE predicate (not pre-checked) to eliminate the TOCTOU race.
-- FORBIDDEN_ROW check: actor must be assigned to the row's project (mirrors the Create check).
-- Entity app.Stakeholder (source: tblStakeholders). Module: database-schema-and-procs (#3).
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

    -- Atomic update: RowVer in the WHERE predicate eliminates the TOCTOU window.
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
