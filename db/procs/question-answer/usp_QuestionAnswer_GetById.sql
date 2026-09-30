-- usp_QuestionAnswer_GetById — fetch a single app.QuestionAnswer row by PK.
-- Returns NOT_FOUND (50001) if the row does not exist or is soft-deleted.
-- Existence is checked BEFORE the SELECT so the THROW propagates correctly
-- (placing THROW after SELECT sends an empty result set before the error, which
-- the repository would see as a Zod parse failure rather than a NOT_FOUND AppError).
-- Entity app.QuestionAnswer (source: tblInterviewQuestionsAnswers). Module: questions-answers (#11).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_QuestionAnswer_GetById
    @QuestionAnswerId INT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1 FROM app.QuestionAnswer
        WHERE QuestionAnswerId = @QuestionAnswerId AND IsDeleted = 0
    )
        THROW 50001, N'NOT_FOUND:Question/answer not found', 1;

    SELECT QuestionAnswerId,
           ProjectId,
           Question,
           Answer,
           Category,
           Priority,
           AssignedTo,
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.QuestionAnswer
    WHERE QuestionAnswerId = @QuestionAnswerId
      AND IsDeleted = 0;
END;
GO
