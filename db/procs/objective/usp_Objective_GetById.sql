-- usp_Objective_GetById — fetch one active app.Objective row; THROW 50001 when absent/soft-deleted.
-- Row-level access via dbo.usp_Project_AssertAccess: NOT_FOUND (50001) vs FORBIDDEN_ROW (50003);
--   Admin bypass; project-less rows are refused for non-Admins.
-- Entity app.Objective (source: tblProjectObjectives). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Objective_GetById
    @ObjectiveId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Objective WHERE ObjectiveId = @ObjectiveId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Objective not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT ObjectiveId,
           [ProjectId],
           [QMeasurable],
           [QSuccess],
           [QAlignmentStrategy],
           [ObjectiveText],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Objective
    WHERE ObjectiveId = @ObjectiveId AND IsDeleted = 0;
END;
GO
