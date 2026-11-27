-- 098_daily_activity_inline_files.sql — a picture pasted into a daily activity's comments is kept
-- with the activity but stays out of its attachment list. app.DailyActivityFile.IsInline marks
-- those links; usp_DailyActivity_ListFiles hides them, usp_DailyActivity_GetFile still serves them,
-- and usp_DailyActivity_Update removes the ones the comments no longer show. Additive and idempotent.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.DailyActivityFile', N'IsInline') IS NULL
    ALTER TABLE app.DailyActivityFile
        ADD IsInline BIT NOT NULL CONSTRAINT DF_DailyActivityFile_IsInline DEFAULT 0;
GO
