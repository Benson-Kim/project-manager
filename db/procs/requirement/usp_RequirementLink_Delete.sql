-- usp_RequirementLink_Delete — remove one link between two requirements (ADR-0060). The two rows
--   stay. A link to a WBS item is taken off by usp_Requirement_Unallocate, which renumbers its list.
-- Access: Contributor + requirements:update. @RowVer is the link's, so a stale write answers 409.
-- The audit row keeps the rationale and status, since the link row itself is gone. Answers with the
--   project id.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementLink_Delete
    @RequirementId         INT,
    @UpstreamRequirementId INT,
    @RowVer                BIGINT,
    @ActorUserId           INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT, @OldRationale NVARCHAR(1000), @OldStatus VARCHAR(10);
    SELECT @CurrentVer = CAST(t.RowVer AS BIGINT), @RowProjectId = t.ProjectId,
           @OldRationale = t.Rationale, @OldStatus = t.LinkStatus
    FROM app.RequirementTrace AS t
    JOIN app.Requirement AS r ON r.RequirementId = t.RequirementId AND r.IsDeleted = 0
    JOIN app.Requirement AS u ON u.RequirementId = t.ValidatesRequirementId AND u.IsDeleted = 0
    WHERE t.RequirementId = @RequirementId AND t.ValidatesRequirementId = @UpstreamRequirementId;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Link not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Link was modified by someone else', 1;

    BEGIN TRAN;

    DELETE FROM app.RequirementTrace
    WHERE RequirementId = @RequirementId AND ValidatesRequirementId = @UpstreamRequirementId
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Link was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'LinkDelete', N'app.RequirementTrace',
            CAST(@RequirementId AS NVARCHAR(64)),
            (SELECT @RequirementId AS requirementId, @UpstreamRequirementId AS upstreamRequirementId,
                    @OldRationale AS rationale, @OldStatus AS linkStatus
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
