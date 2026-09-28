-- usp_QuestionAnswer_Create — insert one app.QuestionAnswer row; audits in-transaction; returns the new row.
-- Project ownership check: @ActorUserId must be an assignee of the target project (FORBIDDEN_ROW 50003).
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

    -- Row-level access: the actor must be assigned to the project they are writing into.
    IF NOT EXISTS (
        SELECT 1 FROM app.ProjectAssignee
        WHERE ProjectId = @ProjectId AND UserId = @ActorUserId
    )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

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
