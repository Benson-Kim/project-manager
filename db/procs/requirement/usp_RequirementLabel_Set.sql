-- usp_RequirementLabel_Set — give a built-in register column the project's own name (ADR-0067).
--   Only the label row is written: the column's stable key, its data, filters, sorting and saved
--   views never change.
-- @RowVer: NULL for a column with no label yet; else the label's version, and a stale one is 409.
-- @BuiltInJson: as usp_RequirementColumn_AssertName; @ColumnKey must be one of its keys.
-- Access: Contributor + requirements:update. Audits the old and the new name.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementLabel_Set
    @ProjectId   INT,
    @ColumnKey   VARCHAR(64),
    @Label       NVARCHAR(200),
    @RowVer      BIGINT = NULL,
    @BuiltInJson NVARCHAR(MAX),
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    IF @BuiltInJson IS NULL OR ISJSON(@BuiltInJson) = 0
       OR NOT EXISTS (SELECT 1 FROM OPENJSON(@BuiltInJson) WITH ([key] VARCHAR(64) '$.key') b
                      WHERE b.[key] = @ColumnKey)
        THROW 50004, N'VALIDATION:This column cannot be renamed', 1;

    SET @Label = TRIM(@Label);

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @ProjectId;

    DECLARE @Old NVARCHAR(80), @CurrentVer BIGINT, @Found BIT = 0;
    SELECT @Found = 1, @Old = Label, @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.RequirementLabel WHERE ProjectId = @ProjectId AND ColumnKey = @ColumnKey;

    IF (@Found = 1 AND (@RowVer IS NULL OR @RowVer <> @CurrentVer)) OR (@Found = 0 AND @RowVer IS NOT NULL)
        THROW 50002, N'CONFLICT:Someone else renamed this column', 1;

    EXEC dbo.usp_RequirementColumn_AssertName
         @ProjectId = @ProjectId, @Name = @Label, @BuiltInJson = @BuiltInJson, @ExceptKey = @ColumnKey;

    IF @Found = 1
        UPDATE app.RequirementLabel SET Label = @Label, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE ProjectId = @ProjectId AND ColumnKey = @ColumnKey AND CAST(RowVer AS BIGINT) = @RowVer;
    ELSE
        INSERT INTO app.RequirementLabel (ProjectId, ColumnKey, Label, CreatedBy)
        VALUES (@ProjectId, @ColumnKey, @Label, @ActorUserId);

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Rename', N'app.RequirementLabel',
            CAST(@ProjectId AS NVARCHAR(30)) + N':' + @ColumnKey,
            (SELECT @Old AS label FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
            (SELECT @Label AS label FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT ColumnKey, Label, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.RequirementLabel WHERE ProjectId = @ProjectId AND ColumnKey = @ColumnKey;
END;
GO
