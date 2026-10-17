-- 026_note_pages.sql — notes become notebooks of titled pages (ADR-0035, checklist rows 17-20).
--   A Note is a notebook (Title = the notebook's name); its pages are app.NoteTab rows (Title,
--   rich-text Content, SortOrder). Note.Content is no longer edited: seed 033 copies each note's
--   Title/Content into its first page, for rows that exist now and rows seeds insert later.
--   app.NoteTab.SearchText holds the page's plain text, written by the procs from the app's
--   sanitised HTML, so the list never searches raw HTML.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.NoteTab', N'SearchText') IS NULL
    ALTER TABLE app.NoteTab ADD [SearchText] NVARCHAR(MAX) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_NoteTab_NoteId' AND object_id = OBJECT_ID(N'app.NoteTab'))
   AND NOT EXISTS (SELECT 1 FROM sys.index_columns ic
                   JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                   JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                   WHERE i.name = N'IX_NoteTab_NoteId' AND ic.object_id = OBJECT_ID(N'app.NoteTab')
                     AND c.name = N'SortOrder')
    DROP INDEX IX_NoteTab_NoteId ON app.NoteTab;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_NoteTab_NoteId' AND object_id = OBJECT_ID(N'app.NoteTab'))
    CREATE INDEX IX_NoteTab_NoteId ON app.NoteTab ([NoteId], IsDeleted, [SortOrder]);
GO
