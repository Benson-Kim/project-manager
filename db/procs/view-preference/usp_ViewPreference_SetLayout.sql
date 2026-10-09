-- Upserts the datasheet layout for a user + module (ADR-0023, migration 019): @Layout is a JSON
-- object {"order": [...], "widths": {...}, "rowHeight": n} (the app validates its members), NULL
-- resets to the module's default. Layouts only exist in list view, so a first preference row
-- starts in list view. Preferences are exempt from audit logging (docs/STANDARDS.md §6).
-- THROW 50004 VALIDATION: @Layout is not a JSON object.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ViewPreference_SetLayout
    @UserId    INT,
    @ModuleKey NVARCHAR(50),
    @Layout    NVARCHAR(2000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @Layout IS NOT NULL AND (ISJSON(@Layout) = 0 OR LEFT(@Layout, 1) <> N'{')
        THROW 50004, N'VALIDATION:Layout must be a JSON object', 1;

    MERGE app.ViewPreference AS target
    USING (SELECT @UserId AS UserId, @ModuleKey AS ModuleKey) AS source
        ON target.UserId = source.UserId AND target.ModuleKey = source.ModuleKey
    WHEN MATCHED THEN
        UPDATE SET Layout = @Layout, UpdatedAtUtc = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (UserId, ModuleKey, ViewMode, Layout)
        VALUES (@UserId, @ModuleKey, 'list', @Layout);
END;
GO
