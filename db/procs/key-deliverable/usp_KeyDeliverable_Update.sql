-- usp_KeyDeliverable_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.KeyDeliverable (source: tblKeyRequirementsDeliverable). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_Update
    @KeyDeliverableId INT,
    @ProjectId INT = NULL,
    @KeyRequirement NVARCHAR(MAX) = NULL,
    @Deadline DATETIME2 = NULL,
    @AssignedToStakeholderId INT = NULL,
    @Priority NVARCHAR(255) = NULL,
    @Status NVARCHAR(255) = NULL,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT KeyDeliverableId, [ProjectId], [KeyRequirement], [Deadline], [AssignedToStakeholderId], [Priority], [Status]
         FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.KeyDeliverable SET
        [ProjectId] = @ProjectId,
        [KeyRequirement] = @KeyRequirement,
        [Deadline] = @Deadline,
        [AssignedToStakeholderId] = @AssignedToStakeholderId,
        [Priority] = @Priority,
        [Status] = @Status,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.KeyDeliverable', CAST(@KeyDeliverableId AS NVARCHAR(64)), @Before,
            (SELECT KeyDeliverableId, [ProjectId], [KeyRequirement], [Deadline], [AssignedToStakeholderId], [Priority], [Status]
             FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId
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
    WHERE KeyDeliverableId = @KeyDeliverableId;
END;
GO
