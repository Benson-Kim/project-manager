-- Seed: parking lot items imported without a status (seed 022 runs after migration 031 on a new
-- database) take it from IsStrikethrough, as migration 031 did for existing rows.
-- Idempotent: the procs never store a NULL status, so only never-set rows match.
USE ProjectManager;
GO
UPDATE app.ParkingLotItem
SET [Status] = CASE WHEN IsStrikethrough = 1 THEN N'Resolved' ELSE N'Active' END
WHERE [Status] IS NULL;
GO
