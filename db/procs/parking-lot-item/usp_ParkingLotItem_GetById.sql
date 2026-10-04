-- usp_ParkingLotItem_GetById — fetch one active app.ParkingLotItem row; THROW 50001 when absent/soft-deleted.
-- FORBIDDEN_ROW check: actor must be assigned to the row's project (unless Admin).
-- Entity app.ParkingLotItem (source: tblParkingLotItems). Module: parking-lot (#18).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ParkingLotItem_GetById
    @ParkingLotItemId INT,
    @ActorUserId      INT,
    @ActorRole        NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.ParkingLotItem WHERE ParkingLotItemId = @ParkingLotItemId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:ParkingLotItem not found', 1;

    -- Row-level access: actor must be assigned to the project that owns this record.
    -- Admin users bypass this check (they have unrestricted access by role definition).
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1
           FROM app.ParkingLotItem pli
           JOIN app.ProjectAssignee pa ON pa.ProjectId = pli.ProjectId AND pa.UserId = @ActorUserId
                                      AND pa.IsDeleted = 0
           WHERE pli.ParkingLotItemId = @ParkingLotItemId AND pli.IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

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
