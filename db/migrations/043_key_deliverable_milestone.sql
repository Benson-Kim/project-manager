-- 043_key_deliverable_milestone.sql — a milestone in the work breakdown (client feedback
-- 2026-10-23; ADR-0046 decision 4).
--   app.KeyDeliverable.IsMilestone BIT NOT NULL DEFAULT 0: the item is a date rather than a span,
--     drawn as a diamond. No new entity and no new tree — a milestone keeps its place, its number
--     ("2.3"), its status colour, its requirements and its assignees, so nothing downstream of the
--     breakdown changes (ADR-0027 decision 1: the deliverables are the breakdown).
--   CK_KeyDeliverable_Milestone_OneDay holds the zero-duration invariant: a milestone always has a
--     day (so it always has something to drag) and that day is both its ends. A task is untouched
--     by the rule. Existing rows all default to 0, so the constraint cannot fail on apply.
--     It is a TABLE-level constraint, not a column one, because it names two further columns
--     (StartDate, Deadline) — SQL Server raises error 8141 for that in a column CHECK, and only on
--     apply (src/tests/migration-check-constraints.test.ts).
--     The comparison is by date, as every date rule in these procs is, so a stray time component on
--     an older row cannot make a milestone unsavable.
--   A milestone is also a leaf: its children would roll their dates up into it and contradict the
--     one-day rule. That one spans rows, so it cannot be a CHECK — it is taken under the project
--     lock by usp_KeyDeliverable_AssertPlacement (no item goes under a milestone) and by
--     usp_KeyDeliverable_SetMilestone (no item with sub-items becomes one).
--   No index: IsMilestone is read with the row it belongs to and is never filtered on.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.KeyDeliverable', N'IsMilestone') IS NULL
    ALTER TABLE app.KeyDeliverable ADD [IsMilestone] BIT NOT NULL
        CONSTRAINT DF_KeyDeliverable_IsMilestone DEFAULT (0);
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                 WHERE name = N'CK_KeyDeliverable_Milestone_OneDay'
                   AND parent_object_id = OBJECT_ID(N'app.KeyDeliverable'))
    ALTER TABLE app.KeyDeliverable ADD CONSTRAINT CK_KeyDeliverable_Milestone_OneDay
        CHECK ([IsMilestone] = 0
               OR (StartDate IS NOT NULL AND [Deadline] IS NOT NULL
                   AND CAST([Deadline] AS DATE) = CAST(StartDate AS DATE)));
GO
