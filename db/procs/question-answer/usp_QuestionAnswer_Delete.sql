-- usp_QuestionAnswer_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.QuestionAnswer (source: tblInterviewQuestionsAnswers). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_QuestionAnswer_Delete
    @QuestionAnswerId INT,
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
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE QuestionAnswerId = @QuestionAnswerId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.QuestionAnswer', CAST(@QuestionAnswerId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
