-- usp_ChecklistColumn_Rename — rename a column; its values stay (ADR-0066).
-- Access: Contributor + checklists:update. A stale @RowVer answers 409.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ChecklistColumn_Rename
    @ChecklistColumnId INT,
    @Name              NVARCHAR(200),
    @RowVer            BIGINT,
    @ActorUserId       INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @ChecklistId INT, @CurrentVer BIGINT, @OldName NVARCHAR(80);
    SELECT @ProjectId = ProjectId, @ChecklistId = ChecklistId,
           @CurrentVer = CAST(RowVer AS BIGINT), @OldName = Name
    FROM app.ChecklistColumn WHERE ChecklistColumnId = @ChecklistColumnId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'checklists:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Column was modified by someone else', 1;

    SET @Name = TRIM(@Name);
    IF @Name IS NULL OR LEN(@Name) = 0 OR LEN(@Name) > 80
        THROW 50004, N'VALIDATION:A column name has 1 to 80 characters', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ChecklistId FROM app.Checklist WITH (UPDLOCK, HOLDLOCK) WHERE ChecklistId = @ChecklistId;

    IF EXISTS (SELECT 1 FROM app.ChecklistColumn
               WHERE ChecklistId = @ChecklistId AND Name = @Name AND IsDeleted = 0
                 AND ChecklistColumnId <> @ChecklistColumnId)
        THROW 50005, N'DUPLICATE:This checklist already has a column with that name', 1;

    UPDATE app.ChecklistColumn SET Name = @Name, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE ChecklistColumnId = @ChecklistColumnId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Column was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.ChecklistColumn', CAST(@ChecklistColumnId AS NVARCHAR(64)),
            (SELECT @OldName AS name FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT @Name AS name FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT ChecklistColumnId, ChecklistId, Name, Kind, ActionKind, SortOrder,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ChecklistColumn WHERE ChecklistColumnId = @ChecklistColumnId;
END;
GO
