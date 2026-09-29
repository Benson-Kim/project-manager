-- usp_KeyDeliverable_Create — insert one app.KeyDeliverable row; audits in-transaction; returns the new row.
-- Entity app.KeyDeliverable (source: tblKeyRequirementsDeliverable). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_Create
    @ProjectId INT = NULL,
    @KeyRequirement NVARCHAR(MAX) = NULL,
    @Deadline DATETIME2 = NULL,
    @AssignedToStakeholderId INT = NULL,
    @Priority NVARCHAR(255) = NULL,
    @Status NVARCHAR(255) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    INSERT INTO app.KeyDeliverable ([ProjectId], [KeyRequirement], [Deadline], [AssignedToStakeholderId], [Priority], [Status], CreatedBy)
    VALUES (@ProjectId, @KeyRequirement, @Deadline, @AssignedToStakeholderId, @Priority, @Status, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.KeyDeliverable', CAST(@Id AS NVARCHAR(64)),
            (SELECT KeyDeliverableId, [ProjectId], [KeyRequirement], [Deadline], [AssignedToStakeholderId], [Priority], [Status]
             FROM app.KeyDeliverable WHERE KeyDeliverableId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT KeyDeliverableId,
           [ProjectId],
           [KeyRequirement],
           [Deadline],
           [AssignedToStakeholderId],
           [Priority],
           [Status],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.KeyDeliverable
    WHERE KeyDeliverableId = @Id;
END;
GO
