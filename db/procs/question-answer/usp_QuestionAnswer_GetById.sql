-- usp_QuestionAnswer_GetById — fetch one active app.QuestionAnswer row; THROW 50001 when absent/soft-deleted.
-- Entity app.QuestionAnswer (source: tblInterviewQuestionsAnswers). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_QuestionAnswer_GetById
    @QuestionAnswerId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.QuestionAnswer WHERE QuestionAnswerId = @QuestionAnswerId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:QuestionAnswer not found', 1;

    SELECT QuestionAnswerId,
           [ProjectId],
           [Question],
           [Answer],
           [Category],
           [Priority],
           [AssignedTo],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.QuestionAnswer
    WHERE QuestionAnswerId = @QuestionAnswerId AND IsDeleted = 0;
END;
GO
