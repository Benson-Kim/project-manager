-- usp_Role_List — fixed role vocabulary (ADR-0015); lookup list, no paging
-- (same pattern as usp_ActivityStatus_List). Module: auth-and-rbac (#4).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Role_List
AS
BEGIN
    SET NOCOUNT ON;
    SELECT RoleId, Name, SortOrder
    FROM auth.Role
    ORDER BY SortOrder, Name;
END;
GO
