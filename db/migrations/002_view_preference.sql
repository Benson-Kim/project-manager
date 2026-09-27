-- 002_view_preference.sql — per-user, per-module list view preference .
-- No FK to auth.User yet: the auth schema arrives in module #4 (issue #4 adds
-- the FK in its migration). Preferences are not domain data: no soft delete,
-- no audit rows (documented exemption, docs/STANDARDS.md §6).
USE ProjectManager;
GO

IF OBJECT_ID(N'app.ViewPreference', N'U') IS NULL
BEGIN
    CREATE TABLE app.ViewPreference (
        UserId       INT NOT NULL,
        ModuleKey    NVARCHAR(50) NOT NULL,
        ViewMode     VARCHAR(10) NOT NULL CONSTRAINT CK_ViewPreference_ViewMode
                     CHECK (ViewMode IN ('grid', 'list')),
        UpdatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_ViewPreference_UpdatedAtUtc
                     DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_ViewPreference PRIMARY KEY (UserId, ModuleKey)
    );
END;
GO
