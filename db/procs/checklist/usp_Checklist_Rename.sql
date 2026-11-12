-- usp_Checklist_Rename — rename a checklist (ADR-0066).
-- Access: Contributor + checklists:update. The project comes from the row. A stale @RowVer answers 409.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Checklist_Rename
    @ChecklistId INT,
    @Name        NVARCHAR(200),
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @CurrentVer BIGINT, @OldName NVARCHAR(120);
    SELECT @ProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT), @OldName = Name
    FROM app.Checklist WHERE ChecklistId = @ChecklistId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Checklist not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'checklists:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Checklist was modified by someone else', 1;

    SET @Name = TRIM(@Name);

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @ProjectId;

    EXEC dbo.usp_Checklist_AssertName @ProjectId = @ProjectId, @ChecklistId = @ChecklistId, @Name = @Name;

    UPDATE app.Checklist SET Name = @Name, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE ChecklistId = @ChecklistId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Checklist was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Checklist', CAST(@ChecklistId AS NVARCHAR(64)),
            (SELECT @OldName AS name FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT @Name AS name FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT ChecklistId, ProjectId, Name, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Checklist WHERE ChecklistId = @ChecklistId;
END;
GO
