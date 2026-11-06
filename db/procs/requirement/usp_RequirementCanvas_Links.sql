-- usp_RequirementCanvas_Links — every link a canvas can draw in its project, both kinds (ADR-0061).
--   Proposed and Active draw; Retired does not. A link with a deleted end is left out. The whole
--   project goes down so a reveal needs no round trip. RowVer is the link's, for its edit and delete.
-- Row-level access: Viewer on the project, taken from the canvas row.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementCanvas_Links
    @RequirementCanvasId INT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId
    FROM app.RequirementCanvas
    WHERE RequirementCanvasId = @RequirementCanvasId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Canvas not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT 'Requirement' AS UpstreamKind, t.ValidatesRequirementId AS UpstreamId,
           t.RequirementId AS DownstreamId, t.LinkStatus, CAST(t.RowVer AS BIGINT) AS RowVer
    FROM app.Requirement AS r
    JOIN app.RequirementTrace AS t ON t.RequirementId = r.RequirementId
    JOIN app.Requirement AS u
        ON u.RequirementId = t.ValidatesRequirementId AND u.IsDeleted = 0
    WHERE r.ProjectId = @RowProjectId AND r.IsDeleted = 0 AND t.LinkStatus <> 'Retired'
    UNION ALL
    SELECT 'Wbs', d.KeyDeliverableId, d.RequirementId, d.LinkStatus, CAST(d.RowVer AS BIGINT)
    FROM app.Requirement AS r
    JOIN app.RequirementDeliverable AS d ON d.RequirementId = r.RequirementId
    JOIN app.KeyDeliverable AS kd
        ON kd.KeyDeliverableId = d.KeyDeliverableId AND kd.IsDeleted = 0
    WHERE r.ProjectId = @RowProjectId AND r.IsDeleted = 0 AND d.LinkStatus <> 'Retired';
END;
GO
