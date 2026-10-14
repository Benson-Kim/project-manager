-- 031_parking_lot_status.sql — a parking lot item's status becomes a managed list
-- (client feedback 2026-10-12; ADR-0022).
--   app.ParkingLotItem.Status NVARCHAR(50), bound to 'parking-lot-item.status' and stored as text.
--   "Active" and "Resolved" are locked: a new item starts Active, and Resolved strikes the item
--   through. Admins add further statuses and colour them like any other list.
--   IsStrikethrough stays and the procs keep it equal to (Status = 'Resolved'), so an app version
--   from before this migration, still running on the same PC, keeps working.
--   Backfill: IsStrikethrough 1 -> Resolved, 0 -> Active (live and soft-deleted rows). Rows that
--   seeds insert later are backfilled by seed 030.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.ParkingLotItem', N'Status') IS NULL
    ALTER TABLE app.ParkingLotItem ADD [Status] NVARCHAR(50) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM app.LookupList WHERE ListKey = N'parking-lot-item.status')
    INSERT INTO app.LookupList (ListKey) VALUES (N'parking-lot-item.status');
GO

DECLARE @Seed TABLE (ListKey NVARCHAR(64), Label NVARCHAR(50), SortOrder INT, IsLocked BIT);
INSERT INTO @Seed (ListKey, Label, SortOrder, IsLocked) VALUES
    (N'parking-lot-item.status', N'Active',   1, 1),
    (N'parking-lot-item.status', N'Resolved', 2, 1);

INSERT INTO app.LookupOption (ListKey, Label, SortOrder, IsLocked, Color, CreatedBy)
SELECT s.ListKey, s.Label, s.SortOrder, s.IsLocked,
       CASE s.Label WHEN N'Resolved' THEN 'green' ELSE 'blue' END, 0
FROM @Seed s
WHERE NOT EXISTS (SELECT 1 FROM app.LookupOption o WHERE o.ListKey = s.ListKey);
GO

UPDATE app.ParkingLotItem
SET [Status] = CASE WHEN IsStrikethrough = 1 THEN N'Resolved' ELSE N'Active' END
WHERE [Status] IS NULL;
GO
