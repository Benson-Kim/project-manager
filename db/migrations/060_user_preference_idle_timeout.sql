-- 060_user_preference_idle_timeout.sql — how long a user may stay idle before being signed out
-- Minutes; 0 = Never. The default of 480 (8 h) is the session length every
-- user had before. Same table and exemptions as migration 059.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.UserPreference', N'IdleTimeoutMinutes') IS NULL
BEGIN
    ALTER TABLE app.UserPreference ADD
        IdleTimeoutMinutes SMALLINT NOT NULL
            CONSTRAINT DF_UserPreference_IdleTimeoutMinutes DEFAULT 480
            CONSTRAINT CK_UserPreference_IdleTimeoutMinutes
                CHECK (IdleTimeoutMinutes = 0 OR IdleTimeoutMinutes BETWEEN 5 AND 1440);
END;
GO
