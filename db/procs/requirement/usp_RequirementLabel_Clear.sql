-- usp_RequirementLabel_Clear — give a built-in register column its default name back (ADR-0067).
--   Deletes only the label row; nothing else is touched.
-- Access: Contributor + requirements:update. A stale @RowVer answers 409. Audits the name removed.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementLabel_Clear
    @ProjectId   INT,
    @ColumnKey   VARCHAR(64),
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    BEGIN TRAN;

    DECLARE @Old NVARCHAR(80);
    SELECT @Old = Label FROM app.RequirementLabel WITH (UPDLOCK, HOLDLOCK)
    WHERE ProjectId = @ProjectId AND ColumnKey = @ColumnKey;
    IF @Old IS NULL
        THROW 50001, N'NOT_FOUND:This column already has its default name', 1;

    DELETE FROM app.RequirementLabel
    WHERE ProjectId = @ProjectId AND ColumnKey = @ColumnKey AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Someone else renamed this column', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Clear', N'app.RequirementLabel',
            CAST(@ProjectId AS NVARCHAR(30)) + N':' + @ColumnKey,
            (SELECT @Old AS label FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;
END;
GO
