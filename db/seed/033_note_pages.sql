-- Seed: each note from before migration 026 becomes a notebook whose first page holds its
-- Title/Content (ADR-0035). Seeds run after the migrations, so this covers notes that existed
-- before 026 and the notes seed 016 inserts on a new database.
--   Only notes that never had a page match (a page deleted later is not re-created).
--   SearchText, for pages with content but no search text yet: the content with the tags
--   removed and the common entities decoded. Pages saved by the app already carry it.
-- Idempotent.
USE ProjectManager;
GO
INSERT INTO app.NoteTab ([NoteId], [Title], [Content], [SortOrder], CreatedBy)
SELECT n.NoteId, COALESCE(NULLIF(TRIM(n.[Title]), N''), N'Page 1'), n.[Content], 1, n.CreatedBy
FROM app.Note AS n
WHERE NOT EXISTS (SELECT 1 FROM app.NoteTab AS t WHERE t.NoteId = n.NoteId);
GO

DECLARE @Pages TABLE (NoteTabId INT PRIMARY KEY);
INSERT INTO @Pages (NoteTabId)
SELECT NoteTabId FROM app.NoteTab WHERE [SearchText] IS NULL AND [Content] IS NOT NULL;

UPDATE t SET [SearchText] = t.[Content]
FROM app.NoteTab AS t JOIN @Pages AS p ON p.NoteTabId = t.NoteTabId;

WHILE EXISTS (SELECT 1 FROM app.NoteTab AS t JOIN @Pages AS p ON p.NoteTabId = t.NoteTabId
              WHERE t.[SearchText] LIKE N'%<%>%')
    UPDATE t
    SET [SearchText] = STUFF(t.[SearchText], CHARINDEX(N'<', t.[SearchText]),
                             CHARINDEX(N'>', t.[SearchText], CHARINDEX(N'<', t.[SearchText]))
                             - CHARINDEX(N'<', t.[SearchText]) + 1, N' ')
    FROM app.NoteTab AS t JOIN @Pages AS p ON p.NoteTabId = t.NoteTabId
    WHERE t.[SearchText] LIKE N'%<%>%';

UPDATE t
SET [SearchText] = NULLIF(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(t.[SearchText],
        N'&nbsp;', N' '), N'&lt;', N'<'), N'&gt;', N'>'), N'&quot;', N'"'), N'&#39;', N''''),
        N'&amp;', N'&')), N'')
FROM app.NoteTab AS t JOIN @Pages AS p ON p.NoteTabId = t.NoteTabId;
GO
