-- usp_RequirementLink_List — every link of one requirement with its record (ADR-0060), for the sheet.
--   Direction is Upstream (it traces to that row), Downstream (that row traces to it) or Wbs. The
--   register's chips keep reading ufn_Requirement_Links, so rationale stays out of the paged list.
-- Row-level access: the project must be accessible at Viewer. LinkedRef and LinkedText are NULL on a
--   Wbs row: the page already holds the deliverable's label. An author who has left reads as NULL.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementLink_List
    @RequirementId INT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId
    FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Requirement not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT l.Direction, l.LinkedId, l.LinkedType, p.Ref AS LinkedRef, n.Requirement AS LinkedText,
           l.Rationale, l.LinkStatus, l.CreatedAtUtc, u.DisplayName AS CreatedByName,
           l.UpdatedAtUtc, CAST(l.RowVer AS BIGINT) AS RowVer
    FROM (SELECT 'Upstream' AS Direction, t.ValidatesRequirementId AS LinkedId, r.RequirementType AS LinkedType,
                 t.Rationale, t.LinkStatus, t.CreatedAtUtc, t.CreatedBy, t.UpdatedAtUtc, t.RowVer
          FROM app.RequirementTrace AS t
          JOIN app.Requirement AS r ON r.RequirementId = t.ValidatesRequirementId AND r.IsDeleted = 0
          WHERE t.RequirementId = @RequirementId
          UNION ALL
          SELECT 'Downstream', t.RequirementId, r.RequirementType,
                 t.Rationale, t.LinkStatus, t.CreatedAtUtc, t.CreatedBy, t.UpdatedAtUtc, t.RowVer
          FROM app.RequirementTrace AS t
          JOIN app.Requirement AS r ON r.RequirementId = t.RequirementId AND r.IsDeleted = 0
          WHERE t.ValidatesRequirementId = @RequirementId
          UNION ALL
          SELECT 'Wbs', d.KeyDeliverableId, 'WBS',
                 d.Rationale, d.LinkStatus, d.CreatedAtUtc, d.CreatedBy, d.UpdatedAtUtc, d.RowVer
          FROM app.RequirementDeliverable AS d
          JOIN app.KeyDeliverable AS kd ON kd.KeyDeliverableId = d.KeyDeliverableId AND kd.IsDeleted = 0
          WHERE d.RequirementId = @RequirementId) AS l
    LEFT JOIN app.Requirement AS n ON l.Direction <> 'Wbs' AND n.RequirementId = l.LinkedId
    OUTER APPLY (SELECT Ref, SortPath FROM dbo.ufn_Requirement_AncestorPath(n.RequirementId)
                 WHERE n.RequirementId IS NOT NULL) AS p
    LEFT JOIN auth.[User] AS u ON u.UserId = l.CreatedBy
    ORDER BY CASE l.Direction WHEN 'Upstream' THEN 1 WHEN 'Downstream' THEN 2 ELSE 3 END,
             p.SortPath, l.LinkedId;
END;
GO
