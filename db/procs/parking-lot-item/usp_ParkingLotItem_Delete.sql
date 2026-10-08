-- usp_ParkingLotItem_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- FORBIDDEN_ROW check: actor must be assigned to the row's project.
-- Admin role bypass: an Admin actor (role read from auth.User) skips the ProjectAssignee check.
-- Entity app.ParkingLotItem (source: tblParkingLotItems). Module: parking-lot (#18).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ParkingLotItem_Delete
    @ParkingLotItemId INT,
    @RowVer           BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.ParkingLotItem WHERE ParkingLotItemId = @ParkingLotItemId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:ParkingLotItem not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @AllowProjectless = 0;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT ParkingLotItemId, [ProjectId], [ParkingLotItem], [StakeholderId], [IsStrikethrough],
                [FollowUpActions], [Owner]
         FROM app.ParkingLotItem WHERE ParkingLotItemId = @ParkingLotItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.ParkingLotItem SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE ParkingLotItemId = @ParkingLotItemId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.ParkingLotItem WHERE ParkingLotItemId = @ParkingLotItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:ParkingLotItem not found', 1;
        THROW 50002, N'CONFLICT:ParkingLotItem was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Delete', N'app.ParkingLotItem', CAST(@ParkingLotItemId AS NVARCHAR(64)), @Before,
            (SELECT ParkingLotItemId, IsDeleted, DeletedAtUtc, DeletedBy
             FROM app.ParkingLotItem WHERE ParkingLotItemId = @ParkingLotItemId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;
END;
GO
