-- usp_ParkingLotItem_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Row-level access: the actor needs Contributor on the row's project (dbo.usp_Project_AssertAccess,
--   ADR-0021; FORBIDDEN_ROW 50003). Admins hold Manager everywhere.
-- The project key is immutable: @ProjectId is accepted but ignored (DB standard).
-- Status (migration 031, ADR-0022): a live option of 'parking-lot-item.status', or unchanged
--   (VALIDATION 50004); NULL keeps the current status. A caller from before 031 sends only
--   @IsStrikethrough: 1 means Resolved, 0 reopens a Resolved item as Active and leaves any other
--   status alone. IsStrikethrough is stored as (Status = 'Resolved').
-- Entity app.ParkingLotItem (source: tblParkingLotItems). Module: parking-lot (#18).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ParkingLotItem_Update
    @ParkingLotItemId INT,
    @ProjectId        INT,
    @ParkingLotItem   NVARCHAR(255)  = NULL,
    @StakeholderId    INT            = NULL,
    @IsStrikethrough  BIT            = NULL,
    @Status           NVARCHAR(50)   = NULL,
    @FollowUpActions  NVARCHAR(MAX)  = NULL,
    @Owner            NVARCHAR(255)  = NULL,
    @RowVer           BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @CurrentStatus NVARCHAR(50);
    SELECT @RowProjectId = ProjectId, @CurrentStatus = [Status]
    FROM app.ParkingLotItem WHERE ParkingLotItemId = @ParkingLotItemId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:ParkingLotItem not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'parking-lot:update', @AllowProjectless = 0;
    SET @ProjectId = @RowProjectId;

    IF @Status IS NULL
        SET @Status = CASE
                          WHEN @IsStrikethrough = 1 THEN N'Resolved'
                          WHEN @IsStrikethrough = 0 AND @CurrentStatus = N'Resolved' THEN N'Active'
                          ELSE @CurrentStatus
                      END;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'parking-lot-item.status', @Label = @Status OUTPUT,
         @CurrentLabel = @CurrentStatus;
    SET @IsStrikethrough = CASE WHEN @Status = N'Resolved' THEN 1 ELSE 0 END;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT ParkingLotItemId, [ProjectId], [ParkingLotItem], [StakeholderId], [IsStrikethrough],
                [Status], [FollowUpActions], [Owner]
         FROM app.ParkingLotItem WHERE ParkingLotItemId = @ParkingLotItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.ParkingLotItem SET
        [ProjectId]       = @ProjectId,
        [ParkingLotItem]  = @ParkingLotItem,
        [StakeholderId]   = @StakeholderId,
        [IsStrikethrough] = @IsStrikethrough,
        [Status]          = @Status,
        [FollowUpActions] = @FollowUpActions,
        [Owner]           = @Owner,
        UpdatedAtUtc      = SYSUTCDATETIME(),
        UpdatedBy         = @ActorUserId
    WHERE ParkingLotItemId = @ParkingLotItemId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.ParkingLotItem WHERE ParkingLotItemId = @ParkingLotItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:ParkingLotItem not found', 1;
        THROW 50002, N'CONFLICT:ParkingLotItem was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.ParkingLotItem', CAST(@ParkingLotItemId AS NVARCHAR(64)), @Before,
            (SELECT ParkingLotItemId, [ProjectId], [ParkingLotItem], [StakeholderId], [IsStrikethrough], [Status], [FollowUpActions], [Owner]
             FROM app.ParkingLotItem WHERE ParkingLotItemId = @ParkingLotItemId
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
    WHERE ParkingLotItemId = @ParkingLotItemId;
END;
GO
