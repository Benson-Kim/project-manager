-- usp_KeyDeliverable_RollUp — an item with sub-items takes its dates from them (ADR-0027):
-- StartDate = the earliest start and Deadline = the latest end of the items at the bottom of its
-- branch. A parent keeps its own value where no item below it has one.
-- A parent whose end would move before its requested date is VALIDATION (Deadline >= RequestedDate,
-- as Create and Update require of the row they write); one that already ended before it is not
-- held to it.
-- @FromKeyDeliverableId limits the work to that item and the items above it, which is all a change
-- to one item (or to its place, its dates or its existence) can move; the item itself may have just
-- been deleted. Without it every parent in the project is recomputed.
-- Called by the key-deliverable write procs inside their transaction, after their access check;
-- it changes parent dates only, and audits each parent it changes (Action 'RollUp').
-- @Audit = 0 makes the same changes without the audit rows, for
-- usp_KeyDeliverable_CascadeDependencies: its fixpoint rolls up once per round, and one audit row
-- per round per parent would record the walk rather than the change. The scheduler audits the net
-- before and after itself (ADR-0046 decision 10).
-- Checks no access itself.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_RollUp
    @ProjectId            INT,
    @ActorUserId          INT,
    @FromKeyDeliverableId INT = NULL,
    @Audit                BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Targets TABLE (KeyDeliverableId INT PRIMARY KEY);
    DECLARE @Changed TABLE (
        KeyDeliverableId INT PRIMARY KEY,
        OldStart DATETIME2 NULL, OldEnd DATETIME2 NULL,
        NewStart DATETIME2 NULL, NewEnd DATETIME2 NULL
    );

    IF @FromKeyDeliverableId IS NULL
        INSERT INTO @Targets (KeyDeliverableId)
        SELECT DISTINCT ParentKeyDeliverableId
        FROM app.KeyDeliverable
        WHERE ProjectId = @ProjectId AND IsDeleted = 0 AND ParentKeyDeliverableId IS NOT NULL;
    ELSE
        WITH up AS (
            SELECT KeyDeliverableId, ParentKeyDeliverableId, IsDeleted, 0 AS Lvl
            FROM app.KeyDeliverable
            WHERE KeyDeliverableId = @FromKeyDeliverableId
            UNION ALL
            SELECT kd.KeyDeliverableId, kd.ParentKeyDeliverableId, kd.IsDeleted, up.Lvl + 1
            FROM up
            JOIN app.KeyDeliverable AS kd ON kd.KeyDeliverableId = up.ParentKeyDeliverableId
            WHERE (up.Lvl = 0 OR up.IsDeleted = 0) AND up.Lvl < 50
        )
        INSERT INTO @Targets (KeyDeliverableId)
        SELECT KeyDeliverableId FROM up;

    WITH pairs AS (
        SELECT t.KeyDeliverableId AS AncestorId, c.KeyDeliverableId AS DescendantId,
               c.StartDate, c.Deadline, 1 AS Depth
        FROM @Targets AS t
        JOIN app.KeyDeliverable AS c
            ON c.ParentKeyDeliverableId = t.KeyDeliverableId AND c.IsDeleted = 0
        WHERE c.ProjectId = @ProjectId
        UNION ALL
        SELECT p.AncestorId, c.KeyDeliverableId, c.StartDate, c.Deadline, p.Depth + 1
        FROM pairs AS p
        JOIN app.KeyDeliverable AS c
            ON c.ParentKeyDeliverableId = p.DescendantId AND c.IsDeleted = 0
        WHERE c.ProjectId = @ProjectId AND p.Depth < 50
    ),
    spans AS (
        SELECT p.AncestorId, MIN(p.StartDate) AS StartDate, MAX(p.Deadline) AS Deadline
        FROM pairs AS p
        WHERE NOT EXISTS (SELECT 1 FROM app.KeyDeliverable AS k
                          WHERE k.ParentKeyDeliverableId = p.DescendantId AND k.IsDeleted = 0
                            AND k.ProjectId = @ProjectId)
        GROUP BY p.AncestorId
    )
    UPDATE kd SET
        StartDate    = ISNULL(s.StartDate, kd.StartDate),
        Deadline     = ISNULL(s.Deadline, kd.Deadline),
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    OUTPUT inserted.KeyDeliverableId, deleted.StartDate, deleted.Deadline,
           inserted.StartDate, inserted.Deadline
    INTO @Changed (KeyDeliverableId, OldStart, OldEnd, NewStart, NewEnd)
    FROM app.KeyDeliverable AS kd
    JOIN spans AS s ON s.AncestorId = kd.KeyDeliverableId
    WHERE kd.IsDeleted = 0
      AND (   (s.StartDate IS NOT NULL AND (kd.StartDate IS NULL OR kd.StartDate <> s.StartDate))
           OR (s.Deadline IS NOT NULL AND (kd.Deadline IS NULL OR kd.Deadline <> s.Deadline)));

    IF EXISTS (SELECT 1 FROM @Changed AS c
               JOIN app.KeyDeliverable AS kd ON kd.KeyDeliverableId = c.KeyDeliverableId
               WHERE c.NewEnd < kd.RequestedDate
                 AND (c.OldEnd IS NULL OR c.OldEnd >= kd.RequestedDate))
        THROW 50004, N'VALIDATION:A parent would end before its requested date', 1;

    IF @Audit = 1
    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    SELECT @ActorUserId, N'RollUp', N'app.KeyDeliverable', CAST(c.KeyDeliverableId AS NVARCHAR(64)),
           (SELECT c.OldStart AS StartDate, c.OldEnd AS Deadline FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
           (SELECT c.NewStart AS StartDate, c.NewEnd AS Deadline FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM @Changed AS c;
END;
GO
