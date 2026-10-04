-- usp_ParkingLotItem_Create — insert one app.ParkingLotItem row; audits in-transaction; returns the new row.
-- Project ownership check: @ActorUserId must be an assignee of the target project (FORBIDDEN_ROW 50003).
-- Admin role bypass: @ActorRole = N'Admin' skips the ProjectAssignee check.
-- Entity app.ParkingLotItem (source: tblParkingLotItems). Module: parking-lot (#18).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ParkingLotItem_Create
    @ProjectId        INT,
    @ParkingLotItem   NVARCHAR(255)  = NULL,
    @StakeholderId    INT            = NULL,
    @IsStrikethrough  BIT,
    @FollowUpActions  NVARCHAR(MAX)  = NULL,
    @Owner            NVARCHAR(255)  = NULL,
    @ActorUserId      INT,
    @ActorRole        NVARCHAR(50)   = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;

    -- Row-level access: the actor must be assigned to the project they are writing into.
    -- Admin users bypass this check (they have unrestricted access by role definition).
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.ProjectAssignee
           WHERE ProjectId = @ProjectId AND UserId = @ActorUserId AND IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

    BEGIN TRAN;

    INSERT INTO app.ParkingLotItem ([ProjectId], [ParkingLotItem], [StakeholderId], [IsStrikethrough], [FollowUpActions], [Owner], CreatedBy)
    VALUES (@ProjectId, @ParkingLotItem, @StakeholderId, @IsStrikethrough, @FollowUpActions, @Owner, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.ParkingLotItem', CAST(@Id AS NVARCHAR(64)),
            (SELECT ParkingLotItemId, [ProjectId], [ParkingLotItem], [StakeholderId], [IsStrikethrough], [FollowUpActions], [Owner]
             FROM app.ParkingLotItem WHERE ParkingLotItemId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

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
    WHERE ParkingLotItemId = @Id;
END;
GO
