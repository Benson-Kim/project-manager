-- Seed app.Supplier — ALL rows from docs/source/analysis/access-database.md §4 (tbl3rdPartySupplier).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.Supplier ON;

INSERT INTO app.Supplier ([SupplierId], [ProjectId], [SupplierName], [ContactPerson], [EmailAddress], [ContractStartDate], [ContractEndDate], [Rating], [Address], [ProvinceOrState], [Country], [PostalCode], [City], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 2, N'Fiverr Company', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0),
    (2, 2, N'Upwork', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0),
    (3, 2, N'Homework Project', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0),
    (4, 14, N'New Supplier', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0),
    (5, 23, N'I am a supplier', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0),
    (6, 2, N'New Supplier', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0),
    (11, 2, N'Suppli', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0),
    (12, 2, N'SupplierName', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0),
    (13, 26, N'GTI Distributors', N'Eunice Taylor', N'info@gtidistributors.com', N'2024-12-26', N'2024-12-17', N'Excellent', N'617 Annex Avenue', NULL, N'Canada', N'87680', N'Toronto', 0),
    (14, 26, N'Pioneer Trust Limited', N'Tom Hughes', N'pioneertraders@yahoo.com', N'2024-12-24', N'2025-01-11', N'Good', N'26 Trunk Rd', N'Maharashtra', N'India', N'400012', N'Mumbai', 0),
    (16, 1, N'new', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0),
    (17, 1, N'new', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0)
) AS s ([SupplierId], [ProjectId], [SupplierName], [ContactPerson], [EmailAddress], [ContractStartDate], [ContractEndDate], [Rating], [Address], [ProvinceOrState], [Country], [PostalCode], [City], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.Supplier t WHERE t.[SupplierId] = s.[SupplierId]);

SET IDENTITY_INSERT app.Supplier OFF;
GO
