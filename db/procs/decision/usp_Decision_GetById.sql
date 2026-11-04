-- usp_Decision_GetById — fetch one active app.Decision row; THROW 50001 when absent/soft-deleted.
-- Row-level access: @ActorUserId must reach the record's project at Viewer (FORBIDDEN_ROW 50003).
-- Admin role bypass: an Admin actor (role read from auth.User) skips the ProjectAssignee check.
-- The two link sets come back as JSON arrays, NULL when empty, so one row carries the whole
--   decision and the form needs no second round trip.
-- Entity app.Decision (migration 057). Module: decisions (ADR-0055, BL36).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Decision_GetById
    @DecisionId  INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Decision WHERE DecisionId = @DecisionId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Decision not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT d.DecisionId,
           d.[ProjectId],
           d.DecisionNumber,
           d.[Title],
           d.[DateLogged],
           d.[OwnerStakeholderId],
           d.[Status],
           d.[ProblemContext],
           d.[OptionsConsidered],
           d.[Rationale],
           d.[NextSteps],
           d.[SupersededByDecisionId],
           (SELECT a.Label AS label FROM app.DecisionImpactedArea AS a
            WHERE a.DecisionId = d.DecisionId ORDER BY a.Label
            FOR JSON PATH) AS ImpactedAreas,
           (SELECT s.StakeholderId AS id FROM app.DecisionStakeholder AS s
            WHERE s.DecisionId = d.DecisionId ORDER BY s.StakeholderId
            FOR JSON PATH) AS ConsultedStakeholderIds,
           d.CreatedAtUtc,
           d.UpdatedAtUtc,
           CAST(d.RowVer AS BIGINT) AS RowVer
    FROM app.Decision AS d
    WHERE d.DecisionId = @DecisionId AND d.IsDeleted = 0;
END;
GO
