-- usp_KeyDeliverable_CascadeDependencies — the schedule's one auto-scheduler (ADR-0046
-- decisions 6-10). A link whose successor starts or finishes too early moves that successor to the
-- earliest day the link allows, and the move cascades down the chain.
--   The four types, over spans whose both ends are inclusive days, with a lag in days:
--     FS  the successor may not start until the predecessor has finished: Start >= P.Deadline+1+lag
--     SS  the successor may not start before the predecessor starts:      Start >= P.StartDate+lag
--     FF  the successor may not finish before the predecessor finishes:   Deadline >= P.Deadline+lag
--     SF  the successor may not finish before the predecessor starts:     Deadline >= P.StartDate+lag
--   Only FS carries the +1: the ends are inclusive, so a successor starting on its predecessor's
--   last day would overlap it. At lag 0 that is the only thing separating FS from SS.
--   A successor is only ever pushed LATER, never pulled earlier (decision 7). So the loop
--   terminates (each round strictly increases a date, and decision 5 keeps the graph acyclic), it
--   can never break Deadline >= RequestedDate (a floor, which a later end only satisfies further),
--   and slack is never reclaimed behind anyone's back.
--   A successor with sub-items shifts as a whole branch, the way a dragged parent does, so a
--   summary keeps its shape and a milestone keeps its one day. When a violated successor sits under
--   another violated successor, only the upper one moves this round — the shift of the branch
--   carries the lower one, and the next round re-reads where it landed.
--   A link whose ends lack the dates its type needs is skipped: an undated item is not scheduled.
-- Called by the key-deliverable write procs AFTER their own usp_KeyDeliverable_RollUp, inside their
--   transaction and after their access check, holding the app.Project (UPDLOCK, HOLDLOCK) that
--   ADR-0027 decision 4 requires. It checks no access itself.
--   It is purely additive: a project with no live links returns at once, so every proc that calls it
--   writes and audits exactly what it did before 044, and a project that uses no dependencies is
--   untouched by this one. Each row the schedule moves is then audited once with its net before and
--   after (Action 'Cascade'), which keeps 'RollUp' meaning "a parent followed its children" and
--   'Cascade' meaning "a dependency pushed this".
-- Rows the cascade moves carry no RowVer check: they are state the schedule derives, serialized by
--   the project lock, exactly as rolled-up parent dates always have been (decision 8).
-- Entity app.KeyDeliverable. Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_CascadeDependencies
    @ProjectId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- It moves rows it holds no RowVer for (decision 8), which is only safe under the caller's
    -- transaction and its app.Project (UPDLOCK, HOLDLOCK). Refuse to run outside one rather than
    -- reschedule a project unserialized.
    IF @@TRANCOUNT = 0
        THROW 50004, N'VALIDATION:Dependencies are only rescheduled inside a deliverable write', 1;

    -- No links: the caller's own roll-up was all this project needed.
    IF NOT EXISTS (SELECT 1 FROM app.KeyDeliverableDependency
                   WHERE ProjectId = @ProjectId AND IsDeleted = 0)
        RETURN;

    DECLARE @Before TABLE (
        KeyDeliverableId INT PRIMARY KEY,
        StartDate DATETIME2 NULL,
        Deadline  DATETIME2 NULL
    );
    INSERT INTO @Before (KeyDeliverableId, StartDate, Deadline)
    SELECT KeyDeliverableId, StartDate, [Deadline]
    FROM app.KeyDeliverable
    WHERE ProjectId = @ProjectId AND IsDeleted = 0;

    DECLARE @Shifts TABLE (KeyDeliverableId INT PRIMARY KEY, ShiftDays INT NOT NULL);
    DECLARE @Round INT = 0;
    DECLARE @MaxRounds INT = 50;
    DECLARE @Converged BIT = 0;

    WHILE @Round < @MaxRounds AND @Converged = 0
    BEGIN
        DELETE FROM @Shifts;

        -- The furthest any of an item's links pushes it. A link is read only when both ends still
        -- have the dates its type needs.
        INSERT INTO @Shifts (KeyDeliverableId, ShiftDays)
        SELECT d.SuccessorId, MAX(v.ShiftDays)
        FROM app.KeyDeliverableDependency AS d
        JOIN app.KeyDeliverable AS p
            ON p.KeyDeliverableId = d.PredecessorId AND p.IsDeleted = 0
        JOIN app.KeyDeliverable AS s
            ON s.KeyDeliverableId = d.SuccessorId AND s.IsDeleted = 0
        CROSS APPLY (
            SELECT DATEDIFF(
                       DAY,
                       CASE WHEN d.DependencyType IN ('FS', 'SS') THEN s.StartDate ELSE s.[Deadline] END,
                       CASE d.DependencyType
                           WHEN 'FS' THEN DATEADD(DAY, 1 + d.LagDays, p.[Deadline])
                           WHEN 'SS' THEN DATEADD(DAY, d.LagDays, p.StartDate)
                           WHEN 'FF' THEN DATEADD(DAY, d.LagDays, p.[Deadline])
                           WHEN 'SF' THEN DATEADD(DAY, d.LagDays, p.StartDate)
                       END
                   ) AS ShiftDays
        ) AS v
        WHERE d.ProjectId = @ProjectId
          AND d.IsDeleted = 0
          AND v.ShiftDays > 0
          AND s.StartDate IS NOT NULL AND s.[Deadline] IS NOT NULL
          AND (CASE WHEN d.DependencyType IN ('FS', 'FF') THEN p.[Deadline] ELSE p.StartDate END)
              IS NOT NULL
        GROUP BY d.SuccessorId;

        IF NOT EXISTS (SELECT 1 FROM @Shifts)
        BEGIN
            SET @Converged = 1;
            BREAK;
        END

        -- Only the topmost violated items move this round; a branch shift carries the rest.
        DELETE sh
        FROM @Shifts AS sh
        WHERE EXISTS (
            SELECT 1
            FROM dbo.ufn_KeyDeliverable_Ancestors(sh.KeyDeliverableId) AS a
            JOIN @Shifts AS other ON other.KeyDeliverableId = a.KeyDeliverableId
            WHERE a.Distance > 0
        );

        UPDATE kd SET
            StartDate    = DATEADD(DAY, sh.ShiftDays, kd.StartDate),
            [Deadline]   = DATEADD(DAY, sh.ShiftDays, kd.[Deadline]),
            UpdatedAtUtc = SYSUTCDATETIME(),
            UpdatedBy    = @ActorUserId
        FROM app.KeyDeliverable AS kd
        CROSS APPLY (
            -- One shift per row: the branches left in @Shifts are disjoint, so this aggregate has
            -- at most one value, and MAX makes the UPDATE deterministic rather than trusting that.
            SELECT MAX(s.ShiftDays) AS ShiftDays
            FROM @Shifts AS s
            CROSS APPLY dbo.ufn_KeyDeliverable_Branch(s.KeyDeliverableId) AS b
            WHERE b.KeyDeliverableId = kd.KeyDeliverableId
        ) AS sh
        WHERE kd.IsDeleted = 0 AND sh.ShiftDays IS NOT NULL
          AND kd.StartDate IS NOT NULL AND kd.[Deadline] IS NOT NULL;

        -- A moved child changes its parents' span, which may push the parents' own successors.
        EXEC dbo.usp_KeyDeliverable_RollUp
             @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @Audit = 0;

        SET @Round = @Round + 1;
    END

    -- Only an unconverged loop is a refusal: a chain longer than @MaxRounds, or a cycle that
    -- reached the table despite decision 5. Converging on the last round is not.
    IF @Converged = 0
        THROW 50004, N'VALIDATION:These dependencies cannot all be satisfied', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    SELECT @ActorUserId, N'Cascade', N'app.KeyDeliverable',
           CAST(kd.KeyDeliverableId AS NVARCHAR(64)),
           (SELECT b.StartDate AS StartDate, b.Deadline AS [Deadline]
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
           (SELECT kd.StartDate AS StartDate, kd.[Deadline] AS [Deadline]
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM app.KeyDeliverable AS kd
    JOIN @Before AS b ON b.KeyDeliverableId = kd.KeyDeliverableId
    WHERE kd.IsDeleted = 0
      AND (   ISNULL(kd.StartDate, '1900-01-01') <> ISNULL(b.StartDate, '1900-01-01')
           OR ISNULL(kd.[Deadline], '1900-01-01') <> ISNULL(b.Deadline, '1900-01-01'));
END;
GO
