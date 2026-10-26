-- usp_KeyDeliverable_SetMilestone — turn one item into a milestone, or back into a task
-- (ADR-0046 decision 4). A milestone is a date, not a span: its start is also its end, and it has
-- no sub-items. Returns the item's ProjectId.
--   Turning it on collapses the span to its start date — the caller is expected to have named that
--     consequence first ("its 9-day span is dropped"), because this proc cannot put the span back.
--     An item with sub-items is refused with the reason (VALIDATION), not quietly skipped: its
--     dates come from below it, which is the opposite of a zero-duration date.
--     An item with no start date is refused too; a milestone always has a day to drag.
--   Turning it off keeps the one day as both ends, so the item stays exactly where it was drawn and
--     the person widens it afterwards.
--   The requested-date rule of ADR-0027 applies unchanged: a milestone's end *is* its day, so a
--     collapse that would land the end before the row's requested date is VALIDATION.
--   Already in the asked-for state: nothing is written and no audit row is added, so a repeated
--     save (a double click, a replayed queue entry) is idempotent.
-- Row-level access: the row's project must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass); rowversion concurrency on the item (50002 CONFLICT).
-- The project row is locked before the leaf check, so a sub-item cannot be inserted under an item
--   in the moment between that check and the write (every breakdown write takes the same lock).
-- Audited in-transaction (Action 'Update'), then parent dates are rolled up: collapsing a span can
--   shorten every parent above it.
-- Entity app.KeyDeliverable. Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_SetMilestone
    @KeyDeliverableId INT,
    @IsMilestone      BIT,
    @RowVer           BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IsMilestone IS NULL
        THROW 50004, N'VALIDATION:Say whether the item is a milestone', 1;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT, @CurrentIsMilestone BIT,
            @CurrentStart DATETIME2, @CurrentEnd DATETIME2, @RequestedDate DATETIME2;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId,
           @CurrentIsMilestone = [IsMilestone],
           @CurrentStart = StartDate, @CurrentEnd = [Deadline], @RequestedDate = [RequestedDate]
    FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    IF @CurrentIsMilestone = @IsMilestone
    BEGIN
        SELECT @RowProjectId AS ProjectId;
        RETURN;
    END;

    IF @IsMilestone = 1
    BEGIN
        IF @CurrentStart IS NULL
            THROW 50004, N'VALIDATION:Give the item a start date first', 1;
        IF @CurrentStart < @RequestedDate
            THROW 50004, N'VALIDATION:Deadline cannot be before RequestedDate', 1;
    END;

    DECLARE @NewEnd DATETIME2 = CASE WHEN @IsMilestone = 1 THEN @CurrentStart ELSE @CurrentEnd END;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    IF @IsMilestone = 1
       AND EXISTS (SELECT 1 FROM app.KeyDeliverable
                   WHERE ParentKeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:An item with sub-items cannot become a milestone', 1;

    UPDATE app.KeyDeliverable SET
        [IsMilestone] = @IsMilestone,
        [Deadline]    = @NewEnd,
        UpdatedAtUtc  = SYSUTCDATETIME(),
        UpdatedBy     = @ActorUserId
    WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.KeyDeliverable', CAST(@KeyDeliverableId AS NVARCHAR(64)),
            (SELECT @CurrentIsMilestone AS [IsMilestone], @CurrentStart AS StartDate,
                    @CurrentEnd AS [Deadline]
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
            (SELECT @IsMilestone AS [IsMilestone], @CurrentStart AS StartDate,
                    @NewEnd AS [Deadline]
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    EXEC dbo.usp_KeyDeliverable_RollUp
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId, @FromKeyDeliverableId = @KeyDeliverableId;

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
