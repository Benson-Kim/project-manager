-- usp_QuestionAnswer_Create — insert one app.QuestionAnswer row; audits in-transaction; returns the new row.
-- Row-level access: the actor needs Contributor on @ProjectId (dbo.usp_Project_AssertAccess,
--   ADR-0021; FORBIDDEN_ROW 50003). Admins hold Manager everywhere.
-- Dropdown values (ADR-0022): Category and Priority must be live options of their lists (VALIDATION 50004),
--   and are stored as listed.
-- Entity app.QuestionAnswer (source: tblInterviewQuestionsAnswers). Module: questions-answers (#11).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_QuestionAnswer_Create
    @ProjectId   INT,
    @Question    NVARCHAR(MAX),
    @Answer      NVARCHAR(MAX)  = NULL,
    @Category    NVARCHAR(255)  = NULL,
    @Priority    NVARCHAR(255)  = NULL,
    @AssignedTo  NVARCHAR(255)  = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Question IS NULL OR LTRIM(RTRIM(@Question)) = N''
        THROW 50004, N'VALIDATION:Question is required', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @AllowProjectless = 0;

    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'question-answer.category', @Label = @Category OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'question-answer.priority', @Label = @Priority OUTPUT;

    BEGIN TRAN;

    INSERT INTO app.QuestionAnswer (ProjectId, Question, Answer, Category, Priority, AssignedTo, CreatedBy)
    VALUES (@ProjectId, @Question, @Answer, @Category, @Priority, @AssignedTo, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.QuestionAnswer', CAST(@Id AS NVARCHAR(64)),
            (SELECT QuestionAnswerId, ProjectId, Question, Answer, Category, Priority, AssignedTo
             FROM app.QuestionAnswer WHERE QuestionAnswerId = @Id
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
    WHERE QuestionAnswerId = @Id;
END;
GO
