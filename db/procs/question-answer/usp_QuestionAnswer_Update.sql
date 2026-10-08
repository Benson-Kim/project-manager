-- usp_QuestionAnswer_Update — full-row update with atomic rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- RowVer is included in the UPDATE predicate (not pre-checked) to eliminate the TOCTOU race.
-- FORBIDDEN_ROW check: actor must be assigned to the row's project (mirrors the Create check).
-- Admin role bypass: an Admin actor (role read from auth.User) skips the ProjectAssignee check (C9-1/C9-2 fix).
-- Dropdown values (ADR-0022): Category and Priority must be live options of their lists, or unchanged (VALIDATION 50004),
--   and are stored as listed.
-- Entity app.QuestionAnswer (source: tblInterviewQuestionsAnswers). Module: questions-answers (#11).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_QuestionAnswer_Update
    @QuestionAnswerId INT,
    @Question         NVARCHAR(MAX),
    @Answer           NVARCHAR(MAX)  = NULL,
    @Category         NVARCHAR(255)  = NULL,
    @Priority         NVARCHAR(255)  = NULL,
    @AssignedTo       NVARCHAR(255)  = NULL,
    @RowVer           BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @CurrentCategory NVARCHAR(255), @CurrentPriority NVARCHAR(255);
    SELECT @RowProjectId = ProjectId, @CurrentCategory = Category, @CurrentPriority = Priority
    FROM app.QuestionAnswer WHERE QuestionAnswerId = @QuestionAnswerId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Question/answer not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @AllowProjectless = 0;

    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'question-answer.category', @Label = @Category OUTPUT,
         @CurrentLabel = @CurrentCategory;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'question-answer.priority', @Label = @Priority OUTPUT,
         @CurrentLabel = @CurrentPriority;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT QuestionAnswerId, ProjectId, Question, Answer, Category, Priority, AssignedTo
         FROM app.QuestionAnswer WHERE QuestionAnswerId = @QuestionAnswerId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic update: RowVer in the WHERE predicate eliminates the TOCTOU window.
    UPDATE app.QuestionAnswer SET
        Question         = @Question,
        Answer           = @Answer,
        Category         = @Category,
        Priority         = @Priority,
        AssignedTo       = @AssignedTo,
        UpdatedAtUtc     = SYSUTCDATETIME(),
        UpdatedBy        = @ActorUserId
    WHERE QuestionAnswerId = @QuestionAnswerId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Question/answer was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.QuestionAnswer', CAST(@QuestionAnswerId AS NVARCHAR(64)), @Before,
            (SELECT QuestionAnswerId, ProjectId, Question, Answer, Category, Priority, AssignedTo
             FROM app.QuestionAnswer WHERE QuestionAnswerId = @QuestionAnswerId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

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
    WHERE QuestionAnswerId = @QuestionAnswerId;
END;
GO
