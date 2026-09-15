-- usp_Keyword_Create — insert one app.Keyword row; audits in-transaction; returns the new row.
-- Entity app.Keyword (source: tblAcronyms). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Keyword_Create
    @ProjectId INT = NULL,
    @Acronym NVARCHAR(255),
    @Definition NVARCHAR(255) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @Acronym IS NULL OR LTRIM(RTRIM(@Acronym)) = N''
        THROW 50004, N'VALIDATION:Acronym is required', 1;
    BEGIN TRAN;

    INSERT INTO app.Keyword ([ProjectId], [Acronym], [Definition], CreatedBy)
    VALUES (@ProjectId, @Acronym, @Definition, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Keyword', CAST(@Id AS NVARCHAR(64)),
            (SELECT KeywordId, [ProjectId], [Acronym], [Definition]
             FROM app.Keyword WHERE KeywordId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT KeywordId,
           [ProjectId],
           [Acronym],
           [Definition],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Keyword
    WHERE KeywordId = @Id;
END;
GO
