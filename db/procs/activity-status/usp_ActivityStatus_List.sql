USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ActivityStatus_List
AS
BEGIN
    SET NOCOUNT ON;
    SELECT ActivityStatusId, Name, SortOrder
    FROM app.ActivityStatus
    ORDER BY SortOrder, Name;
END;
GO
