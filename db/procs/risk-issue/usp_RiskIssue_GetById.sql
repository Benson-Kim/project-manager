-- usp_RiskIssue_GetById — fetch one active app.RiskIssue row; THROW 50001 when absent/soft-deleted.
-- Row-level access: @ActorUserId must reach the record's project at Viewer (FORBIDDEN_ROW 50003).
-- Admin role bypass: an Admin actor (role read from auth.User) skips the ProjectAssignee check.
-- Entity app.RiskIssue (source: tblRisksIssuesTracker). Module: risks-issues (#14, ADR-0050).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RiskIssue_GetById
    @RiskIssueId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.RiskIssue WHERE RiskIssueId = @RiskIssueId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:RiskIssue not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT RiskIssueId,
           [ProjectId],
           [Description],
           [Category],
           [DateIdentified],
           [Status],
           [Priority],
           [Impact],
           [Probability],
           [MitigationPlan],
           [Owner],
           [DueDate],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.RiskIssue
    WHERE RiskIssueId = @RiskIssueId AND IsDeleted = 0;
END;
GO
