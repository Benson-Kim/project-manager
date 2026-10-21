-- usp_KeyDeliverableRequirement_Delete — soft-delete a requirement and renumber (ADR-0036).
-- Returns the item's ProjectId.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverableRequirement_Delete
    @KeyDeliverableRequirementId INT,
    @RowVer                      BIGINT,
    @ActorUserId                 INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT, @ItemId INT;
    SELECT @CurrentVer = CAST(r.RowVer AS BIGINT), @RowProjectId = kd.ProjectId,
           @ItemId = r.KeyDeliverableId
    FROM app.KeyDeliverableRequirement AS r
    JOIN app.KeyDeliverable AS kd ON kd.KeyDeliverableId = r.KeyDeliverableId AND kd.IsDeleted = 0
    WHERE r.KeyDeliverableRequirementId = @KeyDeliverableRequirementId AND r.IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:KeyDeliverableRequirement not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:delete', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:KeyDeliverableRequirement was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT KeyDeliverableRequirementId, KeyDeliverableId, Requirement, IsMet, SortOrder
         FROM app.KeyDeliverableRequirement WHERE KeyDeliverableRequirementId = @KeyDeliverableRequirementId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.KeyDeliverableRequirement SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE KeyDeliverableRequirementId = @KeyDeliverableRequirementId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:KeyDeliverableRequirement was modified by someone else', 1;

    UPDATE r SET
        SortOrder    = o.Position,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    FROM app.KeyDeliverableRequirement AS r
    JOIN (SELECT KeyDeliverableRequirementId AS Id,
                 ROW_NUMBER() OVER (ORDER BY SortOrder, KeyDeliverableRequirementId) AS Position
          FROM app.KeyDeliverableRequirement
          WHERE KeyDeliverableId = @ItemId AND IsDeleted = 0) AS o
        ON o.Id = r.KeyDeliverableRequirementId
    WHERE r.SortOrder <> o.Position;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.KeyDeliverableRequirement',
            CAST(@KeyDeliverableRequirementId AS NVARCHAR(64)), @Before);

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
