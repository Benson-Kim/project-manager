-- usp_Keyword_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.Keyword (source: tblKeywords). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Keyword_Delete
    @KeywordId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.Keyword WHERE KeywordId = @KeywordId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Keyword not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Keyword was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT KeywordId, [ProjectId], [Keyword], [Definition]
         FROM app.Keyword WHERE KeywordId = @KeywordId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Keyword SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE KeywordId = @KeywordId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.Keyword', CAST(@KeywordId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
