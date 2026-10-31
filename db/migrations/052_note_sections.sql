-- 052_note_sections.sql — a note can group its pages into tabs (ADR-0053).
--   app.NoteSection: one tab of a note (the screens call it a tab; app.NoteTab already names a
--     page). Title is required. SortOrder orders the tabs of one note. Soft-deleted like pages.
--     UQ_NoteSection_Note (NoteSectionId, NoteId) is the target of the pages' composite key.
--   app.NoteTab.NoteSectionId INT NULL -> app.NoteSection: the tab a page sits in.
--     FK_NoteTab_NoteSection is composite, (NoteSectionId, NoteId) -> UQ_NoteSection_Note, so a
--     page can only sit in a tab of its own note. NULL means the note has no tabs (MATCH SIMPLE).
--     Page SortOrder stays note-wide; a tab shows its pages in that order.
-- The rules that span rows (a note with tabs has every live page in a live tab; a tab keeps at
-- least one page) are kept by the note-section and note-tab procs under the note's row lock.
-- Existing notes keep NULL and read as notes without tabs. Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.NoteSection', N'U') IS NULL
BEGIN
    CREATE TABLE app.NoteSection (
    NoteSectionId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_NoteSection PRIMARY KEY,
    [NoteId] INT NOT NULL CONSTRAINT FK_NoteSection_Note_NoteId REFERENCES app.Note(NoteId),
    [Title] NVARCHAR(255) NOT NULL,
    [SortOrder] INT NOT NULL CONSTRAINT DF_NoteSection_SortOrder DEFAULT 0,
    IsDeleted     BIT NOT NULL CONSTRAINT DF_NoteSection_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_NoteSection_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION,
    CONSTRAINT UQ_NoteSection_Note UNIQUE (NoteSectionId, NoteId)
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_NoteSection_NoteId' AND object_id = OBJECT_ID(N'app.NoteSection'))
    CREATE INDEX IX_NoteSection_NoteId ON app.NoteSection ([NoteId], IsDeleted, [SortOrder]);
GO

IF COL_LENGTH(N'app.NoteTab', N'NoteSectionId') IS NULL
    ALTER TABLE app.NoteTab ADD NoteSectionId INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_NoteTab_NoteSection')
    ALTER TABLE app.NoteTab ADD CONSTRAINT FK_NoteTab_NoteSection
        FOREIGN KEY (NoteSectionId, [NoteId]) REFERENCES app.NoteSection (NoteSectionId, [NoteId]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_NoteTab_NoteSectionId' AND object_id = OBJECT_ID(N'app.NoteTab'))
    CREATE INDEX IX_NoteTab_NoteSectionId ON app.NoteTab (NoteSectionId, IsDeleted) WHERE NoteSectionId IS NOT NULL;
GO
