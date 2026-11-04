-- 054_stakeholder_communication_plan.sql — the stakeholder communication plan (client backlog
-- BL34, "Create a Stakeholder communication plan", specified by the 3 Nov 2026 feedback).
--   app.Stakeholder gains [CommunicationPurpose] NVARCHAR(50), [KeyMessageStrategy] NVARCHAR(MAX)
--   and [CommunicationFrequency] NVARCHAR(50).
--   The two dropdowns are managed lists (ADR-0022), bound to
--   'stakeholder.communication-purpose' and 'stakeholder.communication-frequency' and stored as
--   text like every other listed value — never a CHECK constraint, which is what migration 018
--   removed from this very table and what BL20 asks us not to add back. The client's examples are
--   seeds, not a closed set: an Admin adds, renames, reorders and colours them from the datasheet
--   header, and a rename follows the records (dbo.usp_LookupList_Set).
--   Nothing is locked: no code reads any of these labels by name, so every option is the
--   client's to change or remove.
--   No colours are seeded. Neither list is a status a register is scanned for — they are planning
--   fields — so the palette stays empty rather than inventing a meaning nobody asked for.
--   [KeyMessageStrategy] is NVARCHAR(MAX) and sheet-only, as [AdditionalNotes] is: a paragraph
--   does not belong in a datasheet cell.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.Stakeholder', N'CommunicationPurpose') IS NULL
    ALTER TABLE app.Stakeholder ADD [CommunicationPurpose] NVARCHAR(50) NULL;
GO

IF COL_LENGTH(N'app.Stakeholder', N'KeyMessageStrategy') IS NULL
    ALTER TABLE app.Stakeholder ADD [KeyMessageStrategy] NVARCHAR(MAX) NULL;
GO

IF COL_LENGTH(N'app.Stakeholder', N'CommunicationFrequency') IS NULL
    ALTER TABLE app.Stakeholder ADD [CommunicationFrequency] NVARCHAR(50) NULL;
GO

DECLARE @Lists TABLE (ListKey NVARCHAR(64));
INSERT INTO @Lists (ListKey) VALUES
    (N'stakeholder.communication-purpose'),
    (N'stakeholder.communication-frequency');

MERGE app.LookupList AS t
USING (SELECT ListKey FROM @Lists) AS s
ON t.ListKey = s.ListKey
WHEN NOT MATCHED THEN INSERT (ListKey) VALUES (s.ListKey);
GO

-- The client's own words, in the order they wrote them (tab 3, COMMENTS table).
DECLARE @Seed TABLE (ListKey NVARCHAR(64), Label NVARCHAR(50), SortOrder INT, IsLocked BIT);
INSERT INTO @Seed (ListKey, Label, SortOrder, IsLocked) VALUES
    (N'stakeholder.communication-purpose',   N'Gather Requirements', 1, 0),
    (N'stakeholder.communication-purpose',   N'Provide Status',      2, 0),
    (N'stakeholder.communication-purpose',   N'Secure Approvals',    3, 0),
    (N'stakeholder.communication-frequency', N'Daily',               1, 0),
    (N'stakeholder.communication-frequency', N'Weekly',              2, 0),
    (N'stakeholder.communication-frequency', N'Monthly',             3, 0),
    (N'stakeholder.communication-frequency', N'Milestone-Driven',    4, 0),
    (N'stakeholder.communication-frequency', N'Ad-Hoc',              5, 0);

-- Matching on the label (live or retired) never resurrects an option an Admin removed.
MERGE app.LookupOption AS t
USING @Seed AS s
ON t.ListKey = s.ListKey AND t.Label = s.Label
WHEN NOT MATCHED THEN INSERT (ListKey, Label, SortOrder, IsLocked, CreatedBy)
                      VALUES (s.ListKey, s.Label, s.SortOrder, s.IsLocked, 0);
GO
