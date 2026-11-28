-- ufn_Supplier_CustomCells — a supplier's filled cells in the columns its project added
--   (ADR-0067), as JSON: [{"columnId":3,"date":"2026-12-01"},{"columnId":4,"optionId":9}, ...].
--   Cells of a deleted column are left out (they stay in the table, recoverable). NULL when none.
-- The caller has already checked access; this only reads.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_Supplier_CustomCells (@SupplierId INT)
RETURNS NVARCHAR(MAX)
AS
BEGIN
    RETURN (
        SELECT v.SupplierColumnId AS columnId,
               v.TextValue AS [text],
               CONVERT(CHAR(10), v.DateValue, 23) AS [date],
               v.LinkUrl AS link,
               v.OptionId AS optionId
        FROM app.SupplierCell v
        JOIN app.SupplierColumn c ON c.SupplierColumnId = v.SupplierColumnId AND c.IsDeleted = 0
        WHERE v.SupplierId = @SupplierId
        ORDER BY c.SortOrder, c.SupplierColumnId
        FOR JSON PATH);
END;
GO
