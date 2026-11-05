-- 055_key_deliverable_actual_date.sql — the day a deliverable was actually reached (client
-- updates 2026-11-03: "0 to many Milestones" with a name, a target date, an actual date and a
-- status).
--   app.KeyDeliverable.ActualDate DATETIME2 NULL: the day it really happened, against StartDate,
--     which is the day it is aimed at (a milestone's one day; ADR-0046). Three of the four fields
--     the client asked for already existed — the name, the target date and the status (a managed
--     list, 'key-deliverable.status', migration 018) — so the ask is this one column, not a second
--     milestone entity: milestones are deliverables flagged IsMilestone (migration 043) and keep
--     their number, colour, requirements and assignees that way.
--   NULL is "nobody has said yet", which is the state every milestone starts in.
--   No CHECK. An actual date may fall before or after the target: early and late are both facts,
--     and recording which is the point of having the pair. It is also not restricted to
--     milestones — every deliverable can be finished on a day — so turning the milestone flag off
--     never has to blank it.
--   No index: it is read with the row it belongs to and is never filtered on, as IsMilestone is.
--   Existing rows get NULL, so the column cannot fail on apply and no record loses what it said.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.KeyDeliverable', N'ActualDate') IS NULL
    ALTER TABLE app.KeyDeliverable ADD [ActualDate] DATETIME2 NULL;
GO
