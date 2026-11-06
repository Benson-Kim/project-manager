-- usp_Stakeholder_Place — moves one stakeholder on its project's power/interest matrix. Sets Power
--   and Interest only, so a drag or an arrow key never carries the rest of the row.
-- Same guards as usp_Stakeholder_Update: NOT_FOUND 50001; Manager on the row's project with
--   stakeholders:update (FORBIDDEN_ROW 50003); RowVer in the UPDATE predicate (CONFLICT 50002);
--   both values 0 to 100 (VALIDATION 50004); audit in the transaction. Returns the new RowVer.
-- A stakeholder row belongs to one project, so a place is per project.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Stakeholder_Place
    @StakeholderId INT,
    @Power INT,
    @Interest INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Power IS NULL OR @Interest IS NULL
       OR @Power NOT BETWEEN 0 AND 100 OR @Interest NOT BETWEEN 0 AND 100
        THROW 50004, N'VALIDATION:Power and Interest are 0 to 100', 1;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId
    FROM app.Stakeholder WHERE StakeholderId = @StakeholderId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Stakeholder not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'stakeholders:update', @AllowProjectless = 0;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT StakeholderId, [ProjectId], [Power], [Interest]
         FROM app.Stakeholder WHERE StakeholderId = @StakeholderId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Stakeholder SET
        [Power] = @Power,
        [Interest] = @Interest,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE StakeholderId = @StakeholderId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Stakeholder was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Stakeholder', CAST(@StakeholderId AS NVARCHAR(64)), @Before,
            (SELECT StakeholderId, [ProjectId], [Power], [Interest]
             FROM app.Stakeholder WHERE StakeholderId = @StakeholderId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT StakeholderId,
           [Power],
           [Interest],
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Stakeholder
    WHERE StakeholderId = @StakeholderId;
END;
GO
