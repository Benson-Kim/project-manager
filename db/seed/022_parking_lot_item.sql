-- Seed app.ParkingLotItem — ALL rows from docs/source/analysis/access-database.md §4 (tblParkingLotItems).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.ParkingLotItem ON;

INSERT INTO app.ParkingLotItem ([ParkingLotItemId], [ProjectId], [ParkingLotItem], [StakeholderId], [IsStrikethrough], [CreatedBy])
SELECT s.*
FROM (VALUES
    (3, 2, N'1- Per Mustapha of IT: The DME must be able to con', 1, 1, 0),
    (5, 2, N'2- Ambulatory clinical services, how many people d', 1, 0, 0),
    (6, 2, N'What is the GMF-U we must account for in this proj', 1, 1, 0),
    (7, 2, N'Did we renew the contract for GMF-U Myle at St-Mar', 2, 1, 0),
    (8, 2, N'Add a patient portal to the requirements? (what re', 1, 1, 0),
    (9, 2, N'Add Oacis to the requirements, bi-directional with', 2, 1, 0),
    (10, 2, N'7-Standard delay of 2 weeks once she has a static ', 1, 1, 0),
    (11, 2, N'8-Cost of the personnel who will be on the selecti', 2, 1, 0),
    (12, 2, N'9-Speak with Archive for requirements', 2, 0, 0),
    (13, 2, N'10-Who must read and sign off, Catherine Haskins, ', 1, 0, 0),
    (14, 2, N'Parking Lot Item', 2, 1, 0),
    (15, 2, N'New', 1, 1, 0)
) AS s ([ParkingLotItemId], [ProjectId], [ParkingLotItem], [StakeholderId], [IsStrikethrough], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.ParkingLotItem t WHERE t.[ParkingLotItemId] = s.[ParkingLotItemId]);

SET IDENTITY_INSERT app.ParkingLotItem OFF;
GO
