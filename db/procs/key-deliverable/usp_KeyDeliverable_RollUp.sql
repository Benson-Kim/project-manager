-- usp_KeyDeliverable_RollUp — an item with sub-items takes its dates from them (ADR-0027):
-- StartDate = the earliest start and Deadline = the latest end of the items at the bottom of its
-- branch. A parent keeps its own value where no item below it has one.
-- Called by the key-deliverable write procs inside their transaction, after their access check;
-- it changes parent dates only, and audits each parent it changes (Action 'RollUp').
-- Checks no access itself.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_RollUp
    @ProjectId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Changed TABLE (
        KeyDeliverableId INT PRIMARY KEY,
        OldStart DATETIME2 NULL, OldEnd DATETIME2 NULL,
        NewStart DATETIME2 NULL, NewEnd DATETIME2 NULL
    );

    WITH live AS (
        SELECT KeyDeliverableId, ParentKeyDeliverableId, StartDate, Deadline
        FROM app.KeyDeliverable
        WHERE ProjectId = @ProjectId AND IsDeleted = 0
    ),
    pairs AS (
        SELECT c.ParentKeyDeliverableId AS AncestorId, c.KeyDeliverableId AS DescendantId, 1 AS Depth
        FROM live AS c
        WHERE c.ParentKeyDeliverableId IS NOT NULL
        UNION ALL
        SELECT p.AncestorId, c.KeyDeliverableId, p.Depth + 1
        FROM pairs AS p
        JOIN live AS c ON c.ParentKeyDeliverableId = p.DescendantId
        WHERE p.Depth < 50
    ),
    spans AS (
        SELECT p.AncestorId, MIN(d.StartDate) AS StartDate, MAX(d.Deadline) AS Deadline
        FROM pairs AS p
        JOIN live AS d ON d.KeyDeliverableId = p.DescendantId
        WHERE NOT EXISTS (SELECT 1 FROM live AS k WHERE k.ParentKeyDeliverableId = d.KeyDeliverableId)
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

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    SELECT @ActorUserId, N'RollUp', N'app.KeyDeliverable', CAST(c.KeyDeliverableId AS NVARCHAR(64)),
           (SELECT c.OldStart AS StartDate, c.OldEnd AS Deadline FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
           (SELECT c.NewStart AS StartDate, c.NewEnd AS Deadline FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM @Changed AS c;
END;
GO
