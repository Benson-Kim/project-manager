-- usp_ParkingLotItem_GetById — fetch one active app.ParkingLotItem row; THROW 50001 when absent/soft-deleted.
-- Entity app.ParkingLotItem (source: tblParkingLotItems). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ParkingLotItem_GetById
    @ParkingLotItemId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.ParkingLotItem WHERE ParkingLotItemId = @ParkingLotItemId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:ParkingLotItem not found', 1;

    SELECT ParkingLotItemId,
           [ProjectId],
           [ParkingLotItem],
           [StakeholderId],
           [IsStrikethrough],
           [FollowUpActions],
           [Owner],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ParkingLotItem
    WHERE ParkingLotItemId = @ParkingLotItemId AND IsDeleted = 0;
END;
GO
