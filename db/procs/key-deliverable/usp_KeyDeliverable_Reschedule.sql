-- usp_KeyDeliverable_Reschedule — new dates for an item, from dragging or stretching its Gantt bar
-- or editing a date in the work breakdown (ADR-0027).
--   * An item without sub-items takes @StartDate and @Deadline as given.
--   * An item with sub-items takes its dates from them, so it can only be moved: the whole branch
--     shifts by the same number of days, and a different length is VALIDATION.
--   Then the parents' dates are rolled up.
-- Row-level access: the row's project must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass); rowversion concurrency on the item (50002 CONFLICT).
-- Each changed row is audited (Action 'Reschedule'). Returns the item's ProjectId.
-- Entity app.KeyDeliverable. Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_Reschedule
    @KeyDeliverableId INT,
    @StartDate        DATETIME2,
    @Deadline         DATETIME2,
    @RowVer           BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @StartDate IS NULL OR @Deadline IS NULL
        THROW 50004, N'VALIDATION:A start and an end date are required', 1;
    IF @Deadline < @StartDate
        THROW 50004, N'VALIDATION:Deadline cannot be before StartDate', 1;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT, @CurrentStart DATETIME2, @CurrentEnd DATETIME2;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId,
           @CurrentStart = StartDate, @CurrentEnd = [Deadline]
    FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    DECLARE @Changed TABLE (
        KeyDeliverableId INT PRIMARY KEY,
        OldStart DATETIME2 NULL, OldEnd DATETIME2 NULL,
        NewStart DATETIME2 NULL, NewEnd DATETIME2 NULL
    );

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    IF EXISTS (SELECT 1 FROM app.KeyDeliverable
               WHERE ParentKeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0)
    BEGIN
        IF @CurrentStart IS NULL OR @CurrentEnd IS NULL
            THROW 50004, N'VALIDATION:Give the sub-items dates first', 1;
        IF DATEDIFF(DAY, @StartDate, @Deadline) <> DATEDIFF(DAY, @CurrentStart, @CurrentEnd)
            THROW 50004, N'VALIDATION:An item with sub-items can be moved, not stretched', 1;

        DECLARE @Shift INT = DATEDIFF(DAY, @CurrentStart, @StartDate);

        UPDATE kd SET
            StartDate    = DATEADD(DAY, @Shift, kd.StartDate),
            [Deadline]   = DATEADD(DAY, @Shift, kd.[Deadline]),
            UpdatedAtUtc = SYSUTCDATETIME(),
            UpdatedBy    = @ActorUserId
        OUTPUT inserted.KeyDeliverableId, deleted.StartDate, deleted.[Deadline],
               inserted.StartDate, inserted.[Deadline]
        INTO @Changed (KeyDeliverableId, OldStart, OldEnd, NewStart, NewEnd)
        FROM app.KeyDeliverable AS kd
        JOIN dbo.ufn_KeyDeliverable_Branch(@KeyDeliverableId) AS b
            ON b.KeyDeliverableId = kd.KeyDeliverableId
        WHERE @Shift <> 0
          AND (b.Depth > 0 OR CAST(kd.RowVer AS BIGINT) = @RowVer);
    END
    ELSE
        UPDATE app.KeyDeliverable SET
            StartDate    = @StartDate,
            [Deadline]   = @Deadline,
            UpdatedAtUtc = SYSUTCDATETIME(),
            UpdatedBy    = @ActorUserId
        OUTPUT inserted.KeyDeliverableId, deleted.StartDate, deleted.[Deadline],
               inserted.StartDate, inserted.[Deadline]
        INTO @Changed (KeyDeliverableId, OldStart, OldEnd, NewStart, NewEnd)
        WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0
          AND CAST(RowVer AS BIGINT) = @RowVer;

    IF NOT EXISTS (SELECT 1 FROM @Changed WHERE KeyDeliverableId = @KeyDeliverableId)
       AND EXISTS (SELECT 1 FROM app.KeyDeliverable
                   WHERE KeyDeliverableId = @KeyDeliverableId AND CAST(RowVer AS BIGINT) <> @RowVer)
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    SELECT @ActorUserId, N'Reschedule', N'app.KeyDeliverable', CAST(c.KeyDeliverableId AS NVARCHAR(64)),
           (SELECT c.OldStart AS StartDate, c.OldEnd AS [Deadline] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
           (SELECT c.NewStart AS StartDate, c.NewEnd AS [Deadline] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM @Changed AS c;

    EXEC dbo.usp_KeyDeliverable_RollUp @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId;

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
