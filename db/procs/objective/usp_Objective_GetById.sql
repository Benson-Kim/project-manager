-- usp_Objective_GetById — fetch one active app.Objective row; THROW 50001 when absent/soft-deleted.
-- Actor project-scope: @ActorUserId must be an assignee of the owning project (FORBIDDEN_ROW 50003).
-- Admin bypass: @ActorRole = N'Admin' skips the project-scope check.
-- Entity app.Objective (source: tblProjectObjectives). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Objective_GetById
    @ObjectiveId INT,
    @ActorUserId INT,
    @ActorRole   NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Objective WHERE ObjectiveId = @ObjectiveId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Objective not found', 1;

    -- Actor project-scope: the actor must be assigned to the owning project. Admins bypass.
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.Objective o
           JOIN app.ProjectAssignee pa ON pa.ProjectId = o.ProjectId AND pa.UserId = @ActorUserId
                                      AND pa.IsDeleted = 0
           WHERE o.ObjectiveId = @ObjectiveId AND o.IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

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
