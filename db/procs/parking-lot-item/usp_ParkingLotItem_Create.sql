-- usp_ParkingLotItem_Create — insert one app.ParkingLotItem row; audits in-transaction; returns the new row.
-- Project ownership check: @ActorUserId must be an assignee of the target project (FORBIDDEN_ROW 50003).
-- Admin role bypass: an Admin actor (role read from auth.User) skips the ProjectAssignee check.
-- Status (migration 031, ADR-0022): a live option of 'parking-lot-item.status' (VALIDATION 50004);
--   a new item starts Active. A caller from before 031 sends only @IsStrikethrough, which maps to
--   Resolved / Active. IsStrikethrough is stored as (Status = 'Resolved').
-- Entity app.ParkingLotItem (source: tblParkingLotItems). Module: parking-lot (#18).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ParkingLotItem_Create
    @ProjectId        INT,
    @ParkingLotItem   NVARCHAR(255)  = NULL,
    @StakeholderId    INT            = NULL,
    @IsStrikethrough  BIT            = NULL,
    @Status           NVARCHAR(50)   = NULL,
    @FollowUpActions  NVARCHAR(MAX)  = NULL,
    @Owner            NVARCHAR(255)  = NULL,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'parking-lot:create', @AllowProjectless = 0;

    IF @Status IS NULL
        SET @Status = CASE WHEN @IsStrikethrough = 1 THEN N'Resolved' ELSE N'Active' END;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'parking-lot-item.status', @Label = @Status OUTPUT;
    SET @IsStrikethrough = CASE WHEN @Status = N'Resolved' THEN 1 ELSE 0 END;

    BEGIN TRAN;

    INSERT INTO app.ParkingLotItem ([ProjectId], [ParkingLotItem], [StakeholderId], [IsStrikethrough], [Status], [FollowUpActions], [Owner], CreatedBy)
    VALUES (@ProjectId, @ParkingLotItem, @StakeholderId, @IsStrikethrough, @Status, @FollowUpActions, @Owner, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.ParkingLotItem', CAST(@Id AS NVARCHAR(64)),
            (SELECT ParkingLotItemId, [ProjectId], [ParkingLotItem], [StakeholderId], [IsStrikethrough], [Status], [FollowUpActions], [Owner]
             FROM app.ParkingLotItem WHERE ParkingLotItemId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT ParkingLotItemId,
           [ProjectId],
           [ParkingLotItem],
           [StakeholderId],
           [IsStrikethrough],
           [Status],
           [FollowUpActions],
           [Owner],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ParkingLotItem
    WHERE ParkingLotItemId = @Id;
END;
GO
