-- usp_Requirement_Unallocate — take one requirement off one deliverable and renumber that list
-- (ADR-0037). The cascade's x: the requirement stays in the register with its links.
-- Access: Contributor + requirements:update. @RowVer is the allocation's.
-- Touches the requirement row (UpdatedAtUtc/By) so the Gantt freshness stamp moves even though the
--   allocation row is gone. Answers with the project id.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_Unallocate
    @RequirementId    INT,
    @KeyDeliverableId INT,
    @RowVer           BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT;
    SELECT @CurrentVer = CAST(d.RowVer AS BIGINT), @RowProjectId = d.ProjectId
    FROM app.RequirementDeliverable AS d
    JOIN app.Requirement AS r ON r.RequirementId = d.RequirementId AND r.IsDeleted = 0
    JOIN app.KeyDeliverable AS kd ON kd.KeyDeliverableId = d.KeyDeliverableId AND kd.IsDeleted = 0
    WHERE d.RequirementId = @RequirementId AND d.KeyDeliverableId = @KeyDeliverableId;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Requirement is not on this deliverable', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Requirement was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    DELETE FROM app.RequirementDeliverable
    WHERE RequirementId = @RequirementId AND KeyDeliverableId = @KeyDeliverableId
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Requirement was modified by someone else', 1;

    UPDATE d SET
        SortOrder = o.Position
    FROM app.RequirementDeliverable AS d
    JOIN (SELECT RequirementId,
                 ROW_NUMBER() OVER (ORDER BY SortOrder, RequirementId) AS Position
          FROM app.RequirementDeliverable
          WHERE KeyDeliverableId = @KeyDeliverableId) AS o
        ON o.RequirementId = d.RequirementId
    WHERE d.KeyDeliverableId = @KeyDeliverableId
      AND d.SortOrder <> o.Position;

    UPDATE app.Requirement SET
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE RequirementId = @RequirementId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Unallocate', N'app.RequirementDeliverable',
            CAST(@RequirementId AS NVARCHAR(64)),
            (SELECT @RequirementId AS requirementId, @KeyDeliverableId AS keyDeliverableId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
