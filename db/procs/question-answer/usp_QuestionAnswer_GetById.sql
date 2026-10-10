-- usp_QuestionAnswer_GetById — fetch a single app.QuestionAnswer row by PK.
-- Returns NOT_FOUND (50001) if the row does not exist or is soft-deleted.
-- Existence is checked BEFORE the SELECT so the THROW propagates correctly
-- (placing THROW after SELECT sends an empty result set before the error, which
-- the repository would see as a Zod parse failure rather than a NOT_FOUND AppError).
-- Row-level access via dbo.usp_Project_AssertAccess: NOT_FOUND (50001) vs FORBIDDEN_ROW (50003);
--   Admin bypass; project-less rows are refused for non-Admins.
-- Entity app.QuestionAnswer (source: tblInterviewQuestionsAnswers). Module: questions-answers (#11).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_QuestionAnswer_GetById
    @QuestionAnswerId INT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.QuestionAnswer WHERE QuestionAnswerId = @QuestionAnswerId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Question/answer not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

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
