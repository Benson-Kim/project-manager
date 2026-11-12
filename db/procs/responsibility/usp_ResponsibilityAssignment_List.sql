-- usp_ResponsibilityAssignment_List — the cells of one matrix, one row per (row, stakeholder). A cell's
--   role is its stored role; on WBS-row matrices a stakeholder with no stored cell who is assigned to
--   the item holds the framework's assignee role (the same precedence as usp_ResponsibilityAssignment_Set).
--   IsMember = 0 marks an assignee who is not a column of the matrix (a row hint). The first result set
--   is the members (columns) in order. Soft-deleted stakeholders appear in neither set. Matrix missing or
--   of another project NOT_FOUND 50001; Viewer with stakeholders:read (FORBIDDEN_ROW 50003).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ResponsibilityAssignment_List
    @ProjectId INT,
    @ResponsibilityMatrixId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @Permission = N'stakeholders:read', @AllowProjectless = 0;

    DECLARE @FrameworkCode NVARCHAR(20), @RowKind NVARCHAR(20);
    SELECT @FrameworkCode = FrameworkCode, @RowKind = RowKind
    FROM app.ResponsibilityMatrix
    WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND ProjectId = @ProjectId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Matrix not found', 1;

    DECLARE @AssigneeRole NVARCHAR(40) =
        CASE WHEN @RowKind = N'WbsItem'
             THEN (SELECT RoleCode FROM app.ResponsibilityRole
                   WHERE FrameworkCode = @FrameworkCode AND IsAssigneeRole = 1) END;

    SELECT mb.StakeholderId, CONCAT_WS(N' ', s.FirstName, s.LastName) AS Name, mb.SortOrder
    FROM app.ResponsibilityMember mb
    JOIN app.Stakeholder s ON s.StakeholderId = mb.StakeholderId AND s.IsDeleted = 0
    WHERE mb.ResponsibilityMatrixId = @ResponsibilityMatrixId
    ORDER BY mb.SortOrder;

    SELECT a.KeyDeliverableId, a.DecisionId, a.StakeholderId, a.RoleCode, CAST(1 AS BIT) AS IsMember
    FROM app.ResponsibilityAssignment a
    JOIN app.Stakeholder s ON s.StakeholderId = a.StakeholderId AND s.IsDeleted = 0
    LEFT JOIN app.KeyDeliverable kd ON kd.KeyDeliverableId = a.KeyDeliverableId
    LEFT JOIN app.Decision d ON d.DecisionId = a.DecisionId
    WHERE a.ResponsibilityMatrixId = @ResponsibilityMatrixId
      AND (kd.IsDeleted = 0 OR d.IsDeleted = 0)
    UNION ALL
    SELECT k.KeyDeliverableId, NULL, k.StakeholderId, @AssigneeRole,
           CAST(CASE WHEN mb.StakeholderId IS NULL THEN 0 ELSE 1 END AS BIT)
    FROM app.KeyDeliverableAssignee k
    JOIN app.KeyDeliverable kd ON kd.KeyDeliverableId = k.KeyDeliverableId
                              AND kd.ProjectId = @ProjectId AND kd.IsDeleted = 0
    JOIN app.Stakeholder s ON s.StakeholderId = k.StakeholderId AND s.IsDeleted = 0
    LEFT JOIN app.ResponsibilityMember mb ON mb.ResponsibilityMatrixId = @ResponsibilityMatrixId
                                         AND mb.StakeholderId = k.StakeholderId
    WHERE @AssigneeRole IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM app.ResponsibilityAssignment a
                      WHERE a.ResponsibilityMatrixId = @ResponsibilityMatrixId
                        AND a.KeyDeliverableId = k.KeyDeliverableId AND a.StakeholderId = k.StakeholderId)
    ORDER BY KeyDeliverableId, DecisionId, StakeholderId;
END
GO
