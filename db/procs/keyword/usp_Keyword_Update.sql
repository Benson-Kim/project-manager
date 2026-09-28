-- usp_Keyword_Update — full-row update with atomic rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- RowVer is included in the UPDATE predicate (not pre-checked) to eliminate the TOCTOU race where two requests
-- pass the pre-check before either write completes, then silently overwrite each other.
-- Entity app.Keyword (source: tblAcronyms → app.Keyword). Module: keywords (#8).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Keyword_Update
    @KeywordId   INT,
    @ProjectId   INT           = NULL,
    @Keyword     NVARCHAR(255),
    @Definition  NVARCHAR(255) = NULL,
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Verify the row exists (NOT_FOUND) before entering the transaction so we
    -- give a useful error even when RowVer is stale.
    IF NOT EXISTS (SELECT 1 FROM app.Keyword WHERE KeywordId = @KeywordId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Keyword not found', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT KeywordId, [ProjectId], [Keyword], [Definition]
         FROM app.Keyword WHERE KeywordId = @KeywordId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic update: RowVer in the WHERE predicate eliminates the TOCTOU window.
    -- If @@ROWCOUNT = 0 here the row either disappeared or was modified concurrently.
    UPDATE app.Keyword SET
        [ProjectId]  = @ProjectId,
        [Keyword]    = @Keyword,
        [Definition] = @Definition,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE KeywordId = @KeywordId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Keyword was modified by someone else', 1;

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
