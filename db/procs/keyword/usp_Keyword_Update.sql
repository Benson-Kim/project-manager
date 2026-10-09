-- usp_Keyword_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Row-level access: the row's project must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass; project-less rows allowed). The project key is immutable:
--   @ProjectId is accepted but ignored (DB standard).
-- Entity app.Keyword (source: tblKeywords). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Keyword_Update
    @KeywordId INT,
    @ProjectId INT = NULL,
    @Keyword NVARCHAR(255),
    @Definition NVARCHAR(255) = NULL,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId
    FROM app.Keyword WHERE KeywordId = @KeywordId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Keyword not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @AllowProjectless = 1;
    SET @ProjectId = @RowProjectId;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Keyword was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT KeywordId, [ProjectId], [Keyword], [Definition]
         FROM app.Keyword WHERE KeywordId = @KeywordId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Keyword SET
        [ProjectId] = @ProjectId,
        [Keyword] = @Keyword,
        [Definition] = @Definition,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE KeywordId = @KeywordId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Keyword WHERE KeywordId = @KeywordId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Keyword not found', 1;
        THROW 50002, N'CONFLICT:Keyword was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Keyword', CAST(@KeywordId AS NVARCHAR(64)), @Before,
            (SELECT KeywordId, [ProjectId], [Keyword], [Definition]
             FROM app.Keyword WHERE KeywordId = @KeywordId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT KeywordId,
           [ProjectId],
           [Keyword],
           [Definition],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Keyword
    WHERE KeywordId = @KeywordId;
END;
GO
