-- usp_QuestionAnswer_GetById — fetch a single app.QuestionAnswer row by PK.
-- Returns NOT_FOUND (50001) if the row does not exist or is soft-deleted.
-- Entity app.QuestionAnswer (source: tblInterviewQuestionsAnswers). Module: questions-answers (#11).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_QuestionAnswer_GetById
    @QuestionAnswerId INT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;

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

    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Question/answer not found', 1;
END;
GO
