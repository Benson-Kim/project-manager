-- usp_Keyword_GetById — fetch one active app.Keyword row; THROW 50001 when absent/soft-deleted.
-- Entity app.Keyword (source: tblAcronyms). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Keyword_GetById
    @KeywordId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Keyword WHERE KeywordId = @KeywordId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Keyword not found', 1;

    SELECT KeywordId,
           [ProjectId],
           [Acronym],
           [Definition],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Keyword
    WHERE KeywordId = @KeywordId AND IsDeleted = 0;
END;
GO
