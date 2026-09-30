-- usp_Objective_GetById — fetch one active app.Objective row; THROW 50001 when absent/soft-deleted.
-- Entity app.Objective (source: tblProjectObjectives). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Objective_GetById
    @ObjectiveId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Objective WHERE ObjectiveId = @ObjectiveId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Objective not found', 1;

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
