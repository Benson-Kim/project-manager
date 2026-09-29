-- usp_QuestionAnswer_Delete — soft delete with atomic rowversion concurrency + in-transaction audit.
-- RowVer is included in the UPDATE predicate to eliminate the TOCTOU race.
-- FORBIDDEN_ROW check: actor must be assigned to the row's project.
-- Admin role bypass: @ActorRole = N'Admin' skips the ProjectAssignee check (C9-1/C9-2 fix).
-- Entity app.QuestionAnswer (source: tblInterviewQuestionsAnswers). Module: questions-answers (#11).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_QuestionAnswer_Delete
    @QuestionAnswerId INT,
    @RowVer           BIGINT,
    @ActorUserId      INT,
    @ActorRole        NVARCHAR(50)   = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM app.QuestionAnswer WHERE QuestionAnswerId = @QuestionAnswerId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Question/answer not found', 1;

    -- Row-level access: actor must be assigned to the project that owns this record.
    -- Admin users bypass this check (they have unrestricted access by role definition).
    IF @ActorRole <> N'Admin'
       AND NOT EXISTS (
           SELECT 1
           FROM app.QuestionAnswer qa
           JOIN app.ProjectAssignee pa ON pa.ProjectId = qa.ProjectId AND pa.UserId = @ActorUserId
           WHERE qa.QuestionAnswerId = @QuestionAnswerId AND qa.IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

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
