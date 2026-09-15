-- usp_QuestionAnswer_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.QuestionAnswer (source: tblInterviewQuestionsAnswers). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_QuestionAnswer_Update
    @QuestionAnswerId INT,
    @ProjectId INT = NULL,
    @Question NVARCHAR(MAX) = NULL,
    @Answer NVARCHAR(MAX) = NULL,
    @Category NVARCHAR(255) = NULL,
    @Priority NVARCHAR(255) = NULL,
    @AssignedTo NVARCHAR(255) = NULL,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.QuestionAnswer WHERE QuestionAnswerId = @QuestionAnswerId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:QuestionAnswer not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:QuestionAnswer was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT QuestionAnswerId, [ProjectId], [Question], [Answer], [Category], [Priority], [AssignedTo]
         FROM app.QuestionAnswer WHERE QuestionAnswerId = @QuestionAnswerId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.QuestionAnswer SET
        [ProjectId] = @ProjectId,
        [Question] = @Question,
        [Answer] = @Answer,
        [Category] = @Category,
        [Priority] = @Priority,
        [AssignedTo] = @AssignedTo,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE QuestionAnswerId = @QuestionAnswerId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.QuestionAnswer', CAST(@QuestionAnswerId AS NVARCHAR(64)), @Before,
            (SELECT QuestionAnswerId, [ProjectId], [Question], [Answer], [Category], [Priority], [AssignedTo]
             FROM app.QuestionAnswer WHERE QuestionAnswerId = @QuestionAnswerId
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
    WHERE QuestionAnswerId = @QuestionAnswerId;
END;
GO
