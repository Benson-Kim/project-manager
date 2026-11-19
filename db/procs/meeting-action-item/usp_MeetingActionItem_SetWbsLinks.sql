-- usp_MeetingActionItem_SetWbsLinks — sets which WBS tasks a meeting action item is about (085).
--   @KeyDeliverableIds is the full set, comma separated; every id must be a live WBS item of the meeting's
--   project (VALIDATION 50004). Rowversion concurrency on the action item (50002 CONFLICT).
-- Access: Contributor on the project for meetings:update, and Viewer for key-deliverables:read.
-- Returns ProjectId and MeetingId for the workspace re-read.
USE ProjectManager;
GO

CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionItem_SetWbsLinks
    @MeetingActionItemId INT,
    @RowVer              BIGINT,
    @KeyDeliverableIds   NVARCHAR(4000),
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ItemId INT = @MeetingActionItemId;
    DECLARE @ProjectId INT, @MeetingId INT;
    SELECT @ProjectId = m.ProjectId, @MeetingId = m.MeetingId
    FROM app.MeetingActionItem AS ai
    JOIN app.Meeting AS m ON m.MeetingId = ai.MeetingId AND m.IsDeleted = 0
    WHERE ai.MeetingActionItemId = @ItemId AND ai.IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:MeetingActionItem not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:update', @AllowProjectless = 0;
    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @Permission = N'key-deliverables:read', @AllowProjectless = 0;

    DECLARE @Want TABLE (KeyDeliverableId INT PRIMARY KEY);
    INSERT INTO @Want (KeyDeliverableId)
    SELECT DISTINCT TRY_CAST(TRIM(value) AS INT)
    FROM STRING_SPLIT(ISNULL(@KeyDeliverableIds, N''), N',')
    WHERE TRIM(value) <> N'';

    IF EXISTS (SELECT 1 FROM @Want AS w
               WHERE w.KeyDeliverableId IS NULL
                  OR NOT EXISTS (SELECT 1 FROM app.KeyDeliverable AS kd
                                 WHERE kd.KeyDeliverableId = w.KeyDeliverableId
                                   AND kd.ProjectId = @ProjectId AND kd.IsDeleted = 0))
        THROW 50004, N'VALIDATION:A task is not in this project', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT l.KeyDeliverableId FROM app.MeetingActionWbsLink AS l
         WHERE l.MeetingActionItemId = @ItemId ORDER BY l.KeyDeliverableId FOR JSON PATH);

    BEGIN TRAN;

    UPDATE app.MeetingActionItem
    SET UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE MeetingActionItemId = @ItemId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:MeetingActionItem was modified by someone else', 1;

    DELETE l FROM app.MeetingActionWbsLink AS l
    WHERE l.MeetingActionItemId = @ItemId
      AND NOT EXISTS (SELECT 1 FROM @Want AS w WHERE w.KeyDeliverableId = l.KeyDeliverableId);

    INSERT INTO app.MeetingActionWbsLink (MeetingActionItemId, KeyDeliverableId, CreatedBy)
    SELECT @ItemId, w.KeyDeliverableId, @ActorUserId
    FROM @Want AS w
    WHERE NOT EXISTS (SELECT 1 FROM app.MeetingActionWbsLink AS l
                      WHERE l.MeetingActionItemId = @ItemId AND l.KeyDeliverableId = w.KeyDeliverableId);

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.MeetingActionWbsLink', CAST(@ItemId AS NVARCHAR(64)), @Before,
            (SELECT l.KeyDeliverableId FROM app.MeetingActionWbsLink AS l
             WHERE l.MeetingActionItemId = @ItemId ORDER BY l.KeyDeliverableId FOR JSON PATH));

    COMMIT;

    SELECT @ProjectId AS ProjectId, @MeetingId AS MeetingId;
END;
GO
