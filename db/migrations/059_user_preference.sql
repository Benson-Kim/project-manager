-- 059_user_preference.sql — per-user settings that are not tied to one list.
-- DueSoonDays is the "Due soon" window for to-dos (client backlog BL08): a to-do due within
-- that many days counts as approaching its deadline. No row = the default of 2 days, which is
-- what every user had before. Preferences are not domain data: no soft delete, no audit rows
-- (same exemption as app.ViewPreference, docs/STANDARDS.md §6).
USE ProjectManager;
GO

IF OBJECT_ID(N'app.UserPreference', N'U') IS NULL
BEGIN
    CREATE TABLE app.UserPreference (
        UserId       INT NOT NULL,
        DueSoonDays  TINYINT NOT NULL CONSTRAINT DF_UserPreference_DueSoonDays DEFAULT 2
                     CONSTRAINT CK_UserPreference_DueSoonDays CHECK (DueSoonDays BETWEEN 1 AND 30),
        UpdatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_UserPreference_UpdatedAtUtc
                     DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_UserPreference PRIMARY KEY (UserId),
        CONSTRAINT FK_UserPreference_User_UserId FOREIGN KEY (UserId)
            REFERENCES auth.[User] (UserId)
    );
END;
GO
