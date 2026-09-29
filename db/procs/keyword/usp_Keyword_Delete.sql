-- usp_Keyword_Delete — soft delete with atomic rowversion concurrency + in-transaction audit.
-- RowVer is included in the UPDATE predicate to eliminate the TOCTOU race (same fix as Update).
-- Entity app.Keyword (source: tblAcronyms → app.Keyword). Module: keywords (#8).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Keyword_Delete
    @KeywordId   INT,
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Keyword WHERE KeywordId = @KeywordId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Keyword not found', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT KeywordId, [ProjectId], [Keyword], [Definition]
         FROM app.Keyword WHERE KeywordId = @KeywordId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic soft-delete: RowVer in the WHERE predicate.
    UPDATE app.Keyword SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE KeywordId = @KeywordId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Keyword was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.Keyword', CAST(@KeywordId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
