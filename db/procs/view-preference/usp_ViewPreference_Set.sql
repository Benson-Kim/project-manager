-- Upserts the view mode for a user + module. Preferences are exempt from
-- audit logging (docs/STANDARDS.md §6): not domain data.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ViewPreference_Set
    @UserId    INT,
    @ModuleKey NVARCHAR(50),
    @ViewMode  VARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    IF @ViewMode NOT IN ('grid', 'list')
        THROW 50004, N'VALIDATION:View mode must be grid or list', 1;

    MERGE app.ViewPreference AS target
    USING (SELECT @UserId AS UserId, @ModuleKey AS ModuleKey) AS source
        ON target.UserId = source.UserId AND target.ModuleKey = source.ModuleKey
    WHEN MATCHED THEN
        UPDATE SET ViewMode = @ViewMode, UpdatedAtUtc = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (UserId, ModuleKey, ViewMode)
        VALUES (@UserId, @ModuleKey, @ViewMode);
END;
GO
