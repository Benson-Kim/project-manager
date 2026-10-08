-- usp_QuestionAnswer_Create — insert one app.QuestionAnswer row; audits in-transaction; returns the new row.
-- Row-level access: the actor needs Contributor on @ProjectId (dbo.usp_Project_AssertAccess,
--   ADR-0021; FORBIDDEN_ROW 50003). Admins hold Manager everywhere.
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

    -- Vocabulary enforcement at the proc boundary (mirrors the z.enum client-side schema;
    -- prevents forged payloads from persisting values that bypass the CHECK constraint).
    IF @Category IS NOT NULL AND @Category NOT IN (N'General', N'Technical', N'Budget', N'Other')
        THROW 50004, N'VALIDATION:Invalid category value', 1;

    IF @Priority IS NOT NULL AND @Priority NOT IN (N'Critical', N'High', N'Medium', N'Low')
        THROW 50004, N'VALIDATION:Invalid priority value', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @AllowProjectless = 0;

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
