-- usp_RiskIssue_GetById — fetch one active app.RiskIssue row; THROW 50001 when absent/soft-deleted.
-- Entity app.RiskIssue (source: tblRisksIssuesTracker). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RiskIssue_GetById
    @RiskIssueId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.RiskIssue WHERE RiskIssueId = @RiskIssueId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:RiskIssue not found', 1;

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
