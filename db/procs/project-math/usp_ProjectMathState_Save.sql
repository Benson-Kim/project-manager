-- usp_ProjectMathState_Save — store the project's Project Math inputs (one row per project).
--   @RowVer NULL = first save; a save over an existing row must send its RowVer.
-- Access: Manager + financials:update. A stale or missing @RowVer answers 409. Audits before and after.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ProjectMathState_Save
    @ProjectId   INT,
    @StateJson   NVARCHAR(MAX),
    @RowVer      BIGINT = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:update', @AllowProjectless = 0;

    IF @StateJson IS NULL OR ISJSON(@StateJson) = 0 OR LEFT(@StateJson, 1) <> N'{'
        THROW 50000, N'VALIDATION:The saved inputs could not be read', 1;
    IF LEN(@StateJson) > 65536
        THROW 50000, N'VALIDATION:Too much to save on this page', 1;

    BEGIN TRAN;

    DECLARE @Old NVARCHAR(MAX), @OldVer BIGINT;
    SELECT @Old = StateJson, @OldVer = CAST(RowVer AS BIGINT)
    FROM app.ProjectMathState WITH (UPDLOCK, HOLDLOCK)
    WHERE ProjectId = @ProjectId;

    IF @OldVer IS NULL
    BEGIN
        IF @RowVer IS NOT NULL
            THROW 50002, N'CONFLICT:Someone else changed these numbers', 1;
        INSERT INTO app.ProjectMathState (ProjectId, StateJson, UpdatedByUserId)
        VALUES (@ProjectId, @StateJson, @ActorUserId);
    END
    ELSE
    BEGIN
        IF @RowVer IS NULL OR @RowVer <> @OldVer
            THROW 50002, N'CONFLICT:Someone else changed these numbers', 1;
        UPDATE app.ProjectMathState
        SET StateJson = @StateJson, UpdatedByUserId = @ActorUserId, UpdatedAtUtc = SYSUTCDATETIME()
        WHERE ProjectId = @ProjectId;
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, CASE WHEN @Old IS NULL THEN N'Create' ELSE N'Update' END, N'app.ProjectMathState',
            CAST(@ProjectId AS NVARCHAR(30)), @Old, @StateJson);

    COMMIT;

    SELECT CAST(RowVer AS BIGINT) AS RowVer, UpdatedAtUtc
    FROM app.ProjectMathState WHERE ProjectId = @ProjectId;
END;
GO
