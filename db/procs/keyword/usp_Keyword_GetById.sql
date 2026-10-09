-- usp_Keyword_GetById — fetch one active app.Keyword row; THROW 50001 when absent/soft-deleted.
-- Row-level access via dbo.usp_Project_AssertAccess: NOT_FOUND (50001) vs FORBIDDEN_ROW (50003);
--   Admin bypass; project-less rows are global (allowed).
-- Entity app.Keyword (source: tblKeywords). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Keyword_GetById
    @KeywordId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Keyword WHERE KeywordId = @KeywordId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Keyword not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 1;

    SELECT KeywordId,
           [ProjectId],
           [Keyword],
           [Definition],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Keyword
    WHERE KeywordId = @KeywordId AND IsDeleted = 0;
END;
GO
