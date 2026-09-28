-- usp_Stakeholder_Delete — soft delete with rowversion concurrency + in-transaction audit.
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

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.Stakeholder WHERE StakeholderId = @StakeholderId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Stakeholder not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Stakeholder was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT StakeholderId, [ProjectId], [FirstName], [LastName], [DepartmentOrganization], [ProjectRole], [RoleDescription], [PhoneNumber], [PhoneExt], [Mobile], [EmailAddress], [PhysicalLocation], [OrgTitle], [CommunicationPreference], [EngagementLevel], [AdditionalNotes]
         FROM app.Stakeholder WHERE StakeholderId = @StakeholderId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Stakeholder SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE StakeholderId = @StakeholderId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.Stakeholder', CAST(@StakeholderId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
