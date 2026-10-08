-- usp_QuestionAnswer_GetById — fetch a single app.QuestionAnswer row by PK.
-- Returns NOT_FOUND (50001) if the row does not exist or is soft-deleted.
-- Actor project-scope: @ActorUserId must be an assignee of the owning project (FORBIDDEN_ROW 50003).
-- Admin bypass: @ActorRole = N'Admin' skips the project-scope check.
-- Existence is checked BEFORE the SELECT so the THROW propagates correctly
-- (placing THROW after SELECT sends an empty result set before the error, which
-- the repository would see as a Zod parse failure rather than a NOT_FOUND AppError).
-- Entity app.QuestionAnswer (source: tblInterviewQuestionsAnswers). Module: questions-answers (#11).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_QuestionAnswer_GetById
    @QuestionAnswerId INT,
    @ActorUserId      INT,
    @ActorRole        NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1 FROM app.QuestionAnswer
        WHERE QuestionAnswerId = @QuestionAnswerId AND IsDeleted = 0
    )
        THROW 50001, N'NOT_FOUND:Question/answer not found', 1;

    -- Actor project-scope: the actor must be assigned to the owning project. Admins bypass.
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.QuestionAnswer qa
           JOIN app.ProjectAssignee pa ON pa.ProjectId = qa.ProjectId AND pa.UserId = @ActorUserId
                                      AND pa.IsDeleted = 0
           WHERE qa.QuestionAnswerId = @QuestionAnswerId AND qa.IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

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
