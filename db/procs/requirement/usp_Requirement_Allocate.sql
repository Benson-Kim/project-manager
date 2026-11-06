-- usp_Requirement_Allocate — put one requirement under one more WBS item (ADR-0061). The canvas
--   draws one link at a time, and two people drawing at once must not overwrite each other, so
--   this reads the list and adds to it under the project lock. usp_Requirement_ReplaceAllocations
--   then does the writing, so the link rules, the level 1 test case check, the ordering and the
--   audit row keep one home. A Retired link comes back as Active, as picking it in the sheet does.
-- Access: Contributor + requirements:update. A live link answers VALIDATION, as
--   usp_RequirementLink_Create does. Touches the requirement row so the Gantt freshness stamp
--   moves, as usp_Requirement_Unallocate does. Answers with the project id.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_Allocate
    @RequirementId    INT,
    @KeyDeliverableId INT,
    @ActorUserId      INT
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

    IF @KeyDeliverableId IS NULL OR @KeyDeliverableId < 1
        THROW 50004, N'VALIDATION:A deliverable was not found', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    IF EXISTS (SELECT 1 FROM app.RequirementDeliverable
               WHERE RequirementId = @RequirementId AND KeyDeliverableId = @KeyDeliverableId
                 AND LinkStatus <> 'Retired')
        THROW 50004, N'VALIDATION:These two are already linked', 1;

    DECLARE @Ids NVARCHAR(MAX) = N'[' +
        (SELECT STRING_AGG(CAST(l.Id AS NVARCHAR(MAX)), N',')
         FROM (SELECT d.KeyDeliverableId AS Id
               FROM app.RequirementDeliverable AS d
               JOIN app.KeyDeliverable AS kd
                   ON kd.KeyDeliverableId = d.KeyDeliverableId AND kd.IsDeleted = 0
               WHERE d.RequirementId = @RequirementId AND d.LinkStatus <> 'Retired'
               UNION
               SELECT @KeyDeliverableId) AS l)
        + N']';

    EXEC dbo.usp_Requirement_ReplaceAllocations
         @RequirementId = @RequirementId, @Ids = @Ids, @ActorUserId = @ActorUserId;

    UPDATE app.Requirement SET
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE RequirementId = @RequirementId;

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
