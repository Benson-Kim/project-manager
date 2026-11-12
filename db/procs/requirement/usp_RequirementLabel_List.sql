-- usp_RequirementLabel_List — the project's own names for built-in register columns (ADR-0067).
-- Row-level access: the project must be accessible at Viewer.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementLabel_List
    @ProjectId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT ColumnKey, Label, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.RequirementLabel
    WHERE ProjectId = @ProjectId
    ORDER BY ColumnKey;
END;
GO
