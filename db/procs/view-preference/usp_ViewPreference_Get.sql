-- Returns the stored view mode and datasheet layout (JSON object, NULL = default layout;
-- migration 019) for a user + module, or no rows when unset.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ViewPreference_Get
    @UserId    INT,
    @ModuleKey NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT ViewMode, Layout
    FROM app.ViewPreference
    WHERE UserId = @UserId
      AND ModuleKey = @ModuleKey;
END;
GO
