-- usp_QuestionAnswer_Update — full-row update with atomic rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- RowVer is included in the UPDATE predicate (not pre-checked) to eliminate the TOCTOU race.
-- FORBIDDEN_ROW check: actor must be assigned to the row's project (mirrors the Create check).
-- Admin role bypass: @ActorRole = N'Admin' skips the ProjectAssignee check (C9-1/C9-2 fix).
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
    @ActorUserId      INT,
    @ActorRole        NVARCHAR(50)   = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM app.QuestionAnswer WHERE QuestionAnswerId = @QuestionAnswerId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Question/answer not found', 1;

    -- Vocabulary enforcement (mirrors the z.enum client-side schema; prevents forged payloads).
    IF @Category IS NOT NULL AND @Category NOT IN (N'General', N'Technical', N'Budget', N'Other')
        THROW 50004, N'VALIDATION:Invalid category value', 1;

    IF @Priority IS NOT NULL AND @Priority NOT IN (N'Critical', N'High', N'Medium', N'Low')
        THROW 50004, N'VALIDATION:Invalid priority value', 1;

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
