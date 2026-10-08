-- usp_Keyword_GetById — fetch one active app.Keyword row; THROW 50001 when absent/soft-deleted.
-- Actor project-scope: @ActorUserId must be an assignee of the owning project (FORBIDDEN_ROW 50003).
-- Admin bypass: @ActorRole = N'Admin' skips the project-scope check.
-- Global keywords (ProjectId IS NULL) bypass the project-scope check.
-- Entity app.Keyword (source: tblKeywords). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Keyword_GetById
    @KeywordId   INT,
    @ActorUserId INT,
    @ActorRole   NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Keyword WHERE KeywordId = @KeywordId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Keyword not found', 1;

    -- Project-scope check: skip for global keywords (ProjectId IS NULL) and for Admins.
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND EXISTS (SELECT 1 FROM app.Keyword WHERE KeywordId = @KeywordId AND ProjectId IS NOT NULL AND IsDeleted = 0)
       AND NOT EXISTS (
           SELECT 1 FROM app.Keyword k
           JOIN app.ProjectAssignee pa ON pa.ProjectId = k.ProjectId AND pa.UserId = @ActorUserId
                                      AND pa.IsDeleted = 0
           WHERE k.KeywordId = @KeywordId AND k.IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

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
