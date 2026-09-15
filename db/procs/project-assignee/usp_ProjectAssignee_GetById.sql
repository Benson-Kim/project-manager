-- usp_ProjectAssignee_GetById — fetch one active app.ProjectAssignee row; THROW 50001 when absent/soft-deleted.
-- Entity app.ProjectAssignee (source: (new — req 0.3 one-or-many PMs/sponsors/BAs)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ProjectAssignee_GetById
    @ProjectAssigneeId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.ProjectAssignee WHERE ProjectAssigneeId = @ProjectAssigneeId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:ProjectAssignee not found', 1;

    SELECT ProjectAssigneeId,
           [ProjectId],
           [Role],
           [PersonName],
           [UserId],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ProjectAssignee
    WHERE ProjectAssigneeId = @ProjectAssigneeId AND IsDeleted = 0;
END;
GO
