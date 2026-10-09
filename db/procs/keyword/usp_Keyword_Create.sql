-- usp_Keyword_Create — insert one app.Keyword row; audits in-transaction; returns the new row.
-- Row-level access: the target @ProjectId must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass; project-less rows allowed).
-- Entity app.Keyword (source: tblKeywords). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Keyword_Create
    @ProjectId INT = NULL,
    @Keyword NVARCHAR(255),
    @Definition NVARCHAR(255) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @AllowProjectless = 1;

    IF @Keyword IS NULL OR LTRIM(RTRIM(@Keyword)) = N''
        THROW 50004, N'VALIDATION:Keyword is required', 1;
    BEGIN TRAN;

    INSERT INTO app.Keyword ([ProjectId], [Keyword], [Definition], CreatedBy)
    VALUES (@ProjectId, @Keyword, @Definition, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Keyword', CAST(@Id AS NVARCHAR(64)),
            (SELECT KeywordId, [ProjectId], [Keyword], [Definition]
             FROM app.Keyword WHERE KeywordId = @Id
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
    WHERE KeywordId = @Id;
END;
GO
