-- 049_risk_issue_lists.sql — the risks & issues register's five dropdowns become managed lists
-- (ADR-0022, ADR-0050; client request "Build the Risks/Issues page").
--   app.RiskIssue.[Category], [Status], [Priority], [Impact], [Probability] are bound to
--   'risk-issue.category', '.status', '.priority', '.impact' and '.probability' and stored as text.
--   The columns are already NVARCHAR(255), wider than LOOKUP_LABEL_MAX, so none is altered.
--   Locked labels are the ones the code reads by name: Risk and Issue are the two kinds of record
--   the register holds, a new record starts Risk/Open, and Closed mutes the row the way a Resolved
--   parking lot item is struck through (migration 031).
--   Values already in the table are adopted as options, so no existing record loses its value or
--   stops being editable: a value outside its list refuses on the next save (usp_LookupList_AssertLabel).
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

DECLARE @Lists TABLE (ListKey NVARCHAR(64));
INSERT INTO @Lists (ListKey) VALUES
    (N'risk-issue.category'),
    (N'risk-issue.status'),
    (N'risk-issue.priority'),
    (N'risk-issue.impact'),
    (N'risk-issue.probability');

MERGE app.LookupList AS t
USING (SELECT ListKey FROM @Lists) AS s
ON t.ListKey = s.ListKey
WHEN NOT MATCHED THEN INSERT (ListKey) VALUES (s.ListKey);
GO

DECLARE @Seed TABLE (ListKey NVARCHAR(64), Label NVARCHAR(50), SortOrder INT, IsLocked BIT);
INSERT INTO @Seed (ListKey, Label, SortOrder, IsLocked) VALUES
    (N'risk-issue.category',    N'Risk',        1, 1),
    (N'risk-issue.category',    N'Issue',       2, 1),
    (N'risk-issue.status',      N'Open',        1, 1),
    (N'risk-issue.status',      N'In Progress', 2, 0),
    (N'risk-issue.status',      N'Closed',      3, 1),
    (N'risk-issue.priority',    N'Critical',    1, 0),
    (N'risk-issue.priority',    N'High',        2, 0),
    (N'risk-issue.priority',    N'Medium',      3, 0),
    (N'risk-issue.priority',    N'Low',         4, 0),
    (N'risk-issue.impact',      N'High',        1, 0),
    (N'risk-issue.impact',      N'Medium',      2, 0),
    (N'risk-issue.impact',      N'Low',         3, 0),
    (N'risk-issue.probability', N'High',        1, 0),
    (N'risk-issue.probability', N'Medium',      2, 0),
    (N'risk-issue.probability', N'Low',         3, 0);

-- One colour per label across all five lists, so a High impact and a High probability read alike.
-- Matching on the label (live or retired) never resurrects an option an Admin removed.
MERGE app.LookupOption AS t
USING @Seed AS s
ON t.ListKey = s.ListKey AND t.Label = s.Label
WHEN MATCHED AND s.IsLocked = 1 AND t.IsLocked = 0 THEN UPDATE SET IsLocked = 1
WHEN NOT MATCHED THEN INSERT (ListKey, Label, SortOrder, IsLocked, Color, CreatedBy)
                      VALUES (s.ListKey, s.Label, s.SortOrder, s.IsLocked,
                              CASE s.Label
                                  WHEN N'Risk'        THEN 'orange'
                                  WHEN N'Issue'       THEN 'red'
                                  WHEN N'Open'        THEN 'blue'
                                  WHEN N'In Progress' THEN 'yellow'
                                  WHEN N'Closed'      THEN 'green'
                                  WHEN N'Critical'    THEN 'red'
                                  WHEN N'High'        THEN 'orange'
                                  WHEN N'Medium'      THEN 'yellow'
                                  WHEN N'Low'         THEN 'gray'
                              END, 0);
GO

-- Adopt values the migrated records already carry (soft-deleted ones too, so a restored record
-- still matches its list). They sort after the seeded options and are not locked.
DECLARE @Existing TABLE (ListKey NVARCHAR(64), Label NVARCHAR(50));
INSERT INTO @Existing (ListKey, Label)
SELECT DISTINCT N'risk-issue.category', LEFT(LTRIM(RTRIM([Category])), 50)
FROM app.RiskIssue WHERE LTRIM(RTRIM(ISNULL([Category], N''))) <> N''
UNION
SELECT DISTINCT N'risk-issue.status', LEFT(LTRIM(RTRIM([Status])), 50)
FROM app.RiskIssue WHERE LTRIM(RTRIM(ISNULL([Status], N''))) <> N''
UNION
SELECT DISTINCT N'risk-issue.priority', LEFT(LTRIM(RTRIM([Priority])), 50)
FROM app.RiskIssue WHERE LTRIM(RTRIM(ISNULL([Priority], N''))) <> N''
UNION
SELECT DISTINCT N'risk-issue.impact', LEFT(LTRIM(RTRIM([Impact])), 50)
FROM app.RiskIssue WHERE LTRIM(RTRIM(ISNULL([Impact], N''))) <> N''
UNION
SELECT DISTINCT N'risk-issue.probability', LEFT(LTRIM(RTRIM([Probability])), 50)
FROM app.RiskIssue WHERE LTRIM(RTRIM(ISNULL([Probability], N''))) <> N'';

INSERT INTO app.LookupOption (ListKey, Label, SortOrder, IsLocked, CreatedBy)
SELECT e.ListKey, e.Label,
       100 + ROW_NUMBER() OVER (PARTITION BY e.ListKey ORDER BY e.Label), 0, 0
FROM @Existing e
WHERE NOT EXISTS (SELECT 1 FROM app.LookupOption o WHERE o.ListKey = e.ListKey AND o.Label = e.Label);
GO

-- Trim the stored values to exactly what the options read, so a record whose value only differed
-- by surrounding whitespace keeps matching its list.
UPDATE app.RiskIssue
SET [Category]    = NULLIF(LTRIM(RTRIM([Category])), N''),
    [Status]      = NULLIF(LTRIM(RTRIM([Status])), N''),
    [Priority]    = NULLIF(LTRIM(RTRIM([Priority])), N''),
    [Impact]      = NULLIF(LTRIM(RTRIM([Impact])), N''),
    [Probability] = NULLIF(LTRIM(RTRIM([Probability])), N'')
WHERE [Category] <> LTRIM(RTRIM([Category])) OR [Status] <> LTRIM(RTRIM([Status]))
   OR [Priority] <> LTRIM(RTRIM([Priority])) OR [Impact] <> LTRIM(RTRIM([Impact]))
   OR [Probability] <> LTRIM(RTRIM([Probability]));
GO
