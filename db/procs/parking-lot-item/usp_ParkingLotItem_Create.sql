-- usp_ParkingLotItem_Create — insert one app.ParkingLotItem row; audits in-transaction; returns the new row.
-- Entity app.ParkingLotItem (source: tblParkingLotItems). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ParkingLotItem_Create
    @ProjectId INT,
    @ParkingLotItem NVARCHAR(255) = NULL,
    @StakeholderId INT = NULL,
    @IsStrikethrough BIT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;
    BEGIN TRAN;

    INSERT INTO app.ParkingLotItem ([ProjectId], [ParkingLotItem], [StakeholderId], [IsStrikethrough], CreatedBy)
    VALUES (@ProjectId, @ParkingLotItem, @StakeholderId, @IsStrikethrough, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.ParkingLotItem', CAST(@Id AS NVARCHAR(64)),
            (SELECT ParkingLotItemId, [ProjectId], [ParkingLotItem], [StakeholderId], [IsStrikethrough]
             FROM app.ParkingLotItem WHERE ParkingLotItemId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT ParkingLotItemId,
           [ProjectId],
           [ParkingLotItem],
           [StakeholderId],
           [IsStrikethrough],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ParkingLotItem
    WHERE ParkingLotItemId = @Id;
END;
GO
