-- usp_ResponsibilityMatrix_List — the project's live matrices with their member counts. Viewer with
--   stakeholders:read (FORBIDDEN_ROW 50003). Not paged: a project holds a handful of matrices.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ResponsibilityMatrix_List
    @ProjectId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @Permission = N'stakeholders:read', @AllowProjectless = 0;

    SELECT m.ResponsibilityMatrixId, m.ProjectId, m.Name, m.FrameworkCode, m.RowKind,
           (SELECT COUNT(*) FROM app.ResponsibilityMember mb
            JOIN app.Stakeholder s ON s.StakeholderId = mb.StakeholderId AND s.IsDeleted = 0
            WHERE mb.ResponsibilityMatrixId = m.ResponsibilityMatrixId) AS MemberCount,
           m.CreatedAtUtc, m.UpdatedAtUtc, CAST(m.RowVer AS BIGINT) AS RowVer
    FROM app.ResponsibilityMatrix m
    WHERE m.ProjectId = @ProjectId AND m.IsDeleted = 0
    ORDER BY m.Name, m.ResponsibilityMatrixId;
END
GO
