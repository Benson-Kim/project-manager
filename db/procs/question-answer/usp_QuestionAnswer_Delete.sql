-- usp_QuestionAnswer_Delete — soft delete with atomic rowversion concurrency + in-transaction audit.
-- RowVer is included in the UPDATE predicate to eliminate the TOCTOU race.
-- FORBIDDEN_ROW check: actor must be assigned to the row's project.
-- Admin role bypass: an Admin actor (role read from auth.User) skips the ProjectAssignee check (C9-1/C9-2 fix).
-- Entity app.QuestionAnswer (source: tblInterviewQuestionsAnswers). Module: questions-answers (#11).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_QuestionAnswer_Delete
    @QuestionAnswerId INT,
    @RowVer           BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.QuestionAnswer WHERE QuestionAnswerId = @QuestionAnswerId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Question/answer not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @AllowProjectless = 0;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT QuestionAnswerId, ProjectId, Question, Answer, Category, Priority, AssignedTo
         FROM app.QuestionAnswer WHERE QuestionAnswerId = @QuestionAnswerId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic soft-delete: RowVer in the WHERE predicate.
    UPDATE app.QuestionAnswer SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE QuestionAnswerId = @QuestionAnswerId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Question/answer was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.QuestionAnswer', CAST(@QuestionAnswerId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
