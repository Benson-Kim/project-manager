-- 015_parking_lot_item_fields.sql
-- Adds FollowUpActions (NVARCHAR(MAX)) and Owner (NVARCHAR(255)) to app.ParkingLotItem.
-- Required fields from requirements.md §4 checklist items 12.3 (follow-up actions) and 12.5 (owner).
-- DateAdded is already represented by CreatedAtUtc (checklist 12.4).
-- Idempotent: column additions are guarded by IF NOT EXISTS.
USE ProjectManager;
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'app.ParkingLotItem') AND name = N'FollowUpActions'
)
    ALTER TABLE app.ParkingLotItem ADD [FollowUpActions] NVARCHAR(MAX) NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'app.ParkingLotItem') AND name = N'Owner'
)
    ALTER TABLE app.ParkingLotItem ADD [Owner] NVARCHAR(255) NULL;
GO
