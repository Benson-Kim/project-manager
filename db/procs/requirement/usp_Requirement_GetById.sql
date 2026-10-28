-- usp_Requirement_GetById — one live requirement with its links both ways and its allocations
-- (ADR-0037); THROW 50001 when absent or soft-deleted.
-- Row-level access: the row's own project is read from the row and asserted
--   (dbo.usp_Project_AssertAccess): NOT_FOUND (50001) vs FORBIDDEN_ROW (50003), Admin bypass.
--   The caller never names the project, so an id from another project cannot be read.
-- Ref, SortPath and Depth come from ufn_Requirement_AncestorPath (ADR-0048), the same single
--   definition the list and the WBS read, so the sheet cannot name a requirement differently from
--   the register it was opened out of.
-- ChildCount is the live sub-requirements directly under the row, as usp_Requirement_List sends it
--   (ADR-0048): the sheet withholds the type select and the delete button while it is above zero,
--   because the procs refuse both and the user should read why before trying.
-- Also the answer of usp_Requirement_{Create,Update}.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_GetById
    @RequirementId INT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId
    FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Requirement not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT r.RequirementId,
           r.ProjectId,
           r.RequirementType,
           r.Number,
           ap.Ref,
           ap.SortPath,
           ap.Depth,
           r.Requirement,
           r.IsMet,
           r.CreatedAtUtc,
           r.UpdatedAtUtc,
           CAST(r.RowVer AS BIGINT) AS RowVer,
           (SELECT COUNT(*) FROM app.Requirement AS ch
            WHERE ch.ParentRequirementId = r.RequirementId AND ch.IsDeleted = 0) AS ChildCount,
           l.ValidatesJson,
           l.ValidatedByJson,
           l.DeliverablesJson
    FROM app.Requirement AS r
    CROSS APPLY dbo.ufn_Requirement_AncestorPath(r.RequirementId) AS ap
    OUTER APPLY dbo.ufn_Requirement_Links(r.RequirementId) AS l
    WHERE r.RequirementId = @RequirementId AND r.IsDeleted = 0;
END;
GO
