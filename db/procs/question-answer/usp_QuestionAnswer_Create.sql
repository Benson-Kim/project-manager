-- usp_QuestionAnswer_Create — insert one app.QuestionAnswer row; audits in-transaction; returns the new row.
-- Entity app.QuestionAnswer (source: tblInterviewQuestionsAnswers). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_QuestionAnswer_Create
    @ProjectId INT = NULL,
    @Question NVARCHAR(MAX) = NULL,
    @Answer NVARCHAR(MAX) = NULL,
    @Category NVARCHAR(255) = NULL,
    @Priority NVARCHAR(255) = NULL,
    @AssignedTo NVARCHAR(255) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    INSERT INTO app.QuestionAnswer ([ProjectId], [Question], [Answer], [Category], [Priority], [AssignedTo], CreatedBy)
    VALUES (@ProjectId, @Question, @Answer, @Category, @Priority, @AssignedTo, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.QuestionAnswer', CAST(@Id AS NVARCHAR(64)),
            (SELECT QuestionAnswerId, [ProjectId], [Question], [Answer], [Category], [Priority], [AssignedTo]
             FROM app.QuestionAnswer WHERE QuestionAnswerId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT QuestionAnswerId,
           [ProjectId],
           [Question],
           [Answer],
           [Category],
           [Priority],
           [AssignedTo],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.QuestionAnswer
    WHERE QuestionAnswerId = @Id;
END;
GO
