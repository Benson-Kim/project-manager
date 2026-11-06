-- usp_RequirementLink_Update — change one link's rationale and status (ADR-0060). Author and date
--   stay as they were. A link to a requirement names @UpstreamRequirementId, a link to a WBS item
--   names @KeyDeliverableId, and exactly one of them is sent.
-- Access: Contributor + requirements:update. @RowVer is the link's, so a stale write answers 409.
-- Rules are not judged again: removing a rule leaves existing links alone, and the loop check counts
--   a Retired link, so bringing one back cannot close a loop. Answers with the project id.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementLink_Update
    @RequirementId         INT,
    @UpstreamRequirementId INT = NULL,
    @KeyDeliverableId      INT = NULL,
    @Rationale             NVARCHAR(1000),
    @LinkStatus            VARCHAR(10),
    @RowVer                BIGINT,
    @ActorUserId           INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF (@UpstreamRequirementId IS NULL AND @KeyDeliverableId IS NULL)
       OR (@UpstreamRequirementId IS NOT NULL AND @KeyDeliverableId IS NOT NULL)
        THROW 50004, N'VALIDATION:Pick one link', 1;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT, @OldRationale NVARCHAR(1000), @OldStatus VARCHAR(10);
    IF @UpstreamRequirementId IS NOT NULL
        SELECT @CurrentVer = CAST(t.RowVer AS BIGINT), @RowProjectId = t.ProjectId,
               @OldRationale = t.Rationale, @OldStatus = t.LinkStatus
        FROM app.RequirementTrace AS t
        JOIN app.Requirement AS r ON r.RequirementId = t.RequirementId AND r.IsDeleted = 0
        JOIN app.Requirement AS u ON u.RequirementId = t.ValidatesRequirementId AND u.IsDeleted = 0
        WHERE t.RequirementId = @RequirementId AND t.ValidatesRequirementId = @UpstreamRequirementId;
    ELSE
        SELECT @CurrentVer = CAST(d.RowVer AS BIGINT), @RowProjectId = d.ProjectId,
               @OldRationale = d.Rationale, @OldStatus = d.LinkStatus
        FROM app.RequirementDeliverable AS d
        JOIN app.Requirement AS r ON r.RequirementId = d.RequirementId AND r.IsDeleted = 0
        JOIN app.KeyDeliverable AS kd ON kd.KeyDeliverableId = d.KeyDeliverableId AND kd.IsDeleted = 0
        WHERE d.RequirementId = @RequirementId AND d.KeyDeliverableId = @KeyDeliverableId;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Link not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    IF @LinkStatus IS NULL OR @LinkStatus NOT IN ('Proposed', 'Active', 'Retired')
        THROW 50004, N'VALIDATION:Pick a link status', 1;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Link was modified by someone else', 1;

    BEGIN TRAN;

    IF @UpstreamRequirementId IS NOT NULL
        UPDATE app.RequirementTrace SET
            Rationale    = @Rationale,
            LinkStatus   = @LinkStatus,
            UpdatedAtUtc = SYSUTCDATETIME(),
            UpdatedBy    = @ActorUserId
        WHERE RequirementId = @RequirementId AND ValidatesRequirementId = @UpstreamRequirementId
          AND CAST(RowVer AS BIGINT) = @RowVer;
    ELSE
        UPDATE app.RequirementDeliverable SET
            Rationale    = @Rationale,
            LinkStatus   = @LinkStatus,
            UpdatedAtUtc = SYSUTCDATETIME(),
            UpdatedBy    = @ActorUserId
        WHERE RequirementId = @RequirementId AND KeyDeliverableId = @KeyDeliverableId
          AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Link was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'LinkUpdate',
            CASE WHEN @KeyDeliverableId IS NULL THEN N'app.RequirementTrace'
                 ELSE N'app.RequirementDeliverable' END,
            CAST(@RequirementId AS NVARCHAR(64)),
            (SELECT @OldRationale AS rationale, @OldStatus AS linkStatus
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
            (SELECT @UpstreamRequirementId AS upstreamRequirementId,
                    @KeyDeliverableId AS keyDeliverableId,
                    @Rationale AS rationale, @LinkStatus AS linkStatus
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
