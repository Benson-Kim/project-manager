-- usp_RequirementLink_Create — put one requirement downstream of another (ADR-0060). The caller can
--   stand at either end: @RequirementId is always the downstream row.
-- Access: Contributor + requirements:update. The project comes from the downstream row. An upstream
--   id that is missing or in another project answers alike, so an id cannot be probed.
-- Needs a row in app.RequirementLinkRule. Rule, duplicate and loop checks all run under the project
--   lock every structure write takes. Links to a WBS item stay with usp_Requirement_ReplaceAllocations,
--   which keeps their order. Answers with the project id.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementLink_Create
    @RequirementId         INT,
    @UpstreamRequirementId INT,
    @Rationale             NVARCHAR(1000) = NULL,
    @LinkStatus            VARCHAR(10) = 'Active',
    @ActorUserId           INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId
    FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Requirement not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    IF @LinkStatus IS NULL OR @LinkStatus NOT IN ('Proposed', 'Active', 'Retired')
        THROW 50004, N'VALIDATION:Pick a link status', 1;

    IF @UpstreamRequirementId IS NULL OR @UpstreamRequirementId = @RequirementId
        THROW 50004, N'VALIDATION:A requirement cannot link to itself', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    DECLARE @RowType VARCHAR(3), @UpstreamType VARCHAR(3);
    SELECT @RowType = RequirementType
    FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0;
    IF @RowType IS NULL
        THROW 50001, N'NOT_FOUND:Requirement not found', 1;

    SELECT @UpstreamType = RequirementType
    FROM app.Requirement
    WHERE RequirementId = @UpstreamRequirementId AND ProjectId = @RowProjectId AND IsDeleted = 0;
    IF @UpstreamType IS NULL
        THROW 50004, N'VALIDATION:A requirement to link was not found', 1;

    IF EXISTS (SELECT 1 FROM app.RequirementTrace
               WHERE RequirementId = @RequirementId
                 AND ValidatesRequirementId = @UpstreamRequirementId)
        THROW 50004, N'VALIDATION:These two are already linked', 1;

    IF NOT EXISTS (SELECT 1 FROM app.RequirementLinkRule
                   WHERE DownstreamType = @RowType AND UpstreamType = @UpstreamType)
        THROW 50004, N'VALIDATION:The link settings do not allow this link', 1;

    INSERT INTO app.RequirementTrace
        (ProjectId, RequirementId, ValidatesRequirementId, Rationale, LinkStatus, CreatedBy)
    VALUES
        (@RowProjectId, @RequirementId, @UpstreamRequirementId, @Rationale, @LinkStatus, @ActorUserId);

    EXEC dbo.usp_Requirement_AssertNoLinkLoop @RequirementId = @RequirementId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'LinkCreate', N'app.RequirementTrace',
            CAST(@RequirementId AS NVARCHAR(64)),
            (SELECT @RequirementId AS requirementId, @UpstreamRequirementId AS upstreamRequirementId,
                    @Rationale AS rationale, @LinkStatus AS linkStatus
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
