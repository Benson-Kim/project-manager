-- 053_assumption_constraint_validated.sql — the assumptions & constraints register's Validated
-- column becomes a managed list (ADR-0022, ADR-0054; client backlog BL20, "customizable
-- Validated/Type options, labels, row/option colours" — Type was already a list, Validated was a
-- checkbox, so the client could neither add an option nor colour the rows by it).
--   app.AssumptionConstraint.[Validated] NVARCHAR(50) is added and bound to
--   'assumption-constraint.validated', stored as text like every other listed value.
--   Yes and No are locked: the code reads those two labels by name (the derived [IsValidated]
--   below), so an Admin may recolour, reorder or add around them but not rename or remove them.
--   Backfill: every existing row carried a boolean, so it becomes exactly Yes or No and no record
--   loses what it said. A new record starts with no value, which the register shows as None — the
--   same as an unset Type or Impact, and honest about nobody having said yet.
--   [IsValidated] BIT is kept and derived by the Create/Update procs
--   (CASE WHEN @Validated = N'Yes'), so a release rolled back to the previous code still reads a
--   correct column and nothing is dropped. It is no longer read by the app
--   (src/tests/assumption-constraint-sql-guardrails.test.ts holds the two in step).
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.AssumptionConstraint', N'Validated') IS NULL
    ALTER TABLE app.AssumptionConstraint ADD [Validated] NVARCHAR(50) NULL;
GO

MERGE app.LookupList AS t
USING (SELECT N'assumption-constraint.validated' AS ListKey) AS s
ON t.ListKey = s.ListKey
WHEN NOT MATCHED THEN INSERT (ListKey) VALUES (s.ListKey);
GO

DECLARE @Seed TABLE (ListKey NVARCHAR(64), Label NVARCHAR(50), SortOrder INT, IsLocked BIT);
INSERT INTO @Seed (ListKey, Label, SortOrder, IsLocked) VALUES
    (N'assumption-constraint.validated', N'Yes', 1, 1),
    (N'assumption-constraint.validated', N'No',  2, 1);

-- Matching on the label (live or retired) never resurrects an option an Admin removed; the
-- colours are the register's own reading of the two states, as a Closed risk is green (049).
MERGE app.LookupOption AS t
USING @Seed AS s
ON t.ListKey = s.ListKey AND t.Label = s.Label
WHEN MATCHED AND s.IsLocked = 1 AND t.IsLocked = 0 THEN UPDATE SET IsLocked = 1
WHEN NOT MATCHED THEN INSERT (ListKey, Label, SortOrder, IsLocked, Color, CreatedBy)
                      VALUES (s.ListKey, s.Label, s.SortOrder, s.IsLocked,
                              CASE s.Label
                                  WHEN N'Yes' THEN 'green'
                                  WHEN N'No'  THEN 'gray'
                              END, 0);
GO

-- The boolean each record carried, as the label it means. Soft-deleted rows too, so a restored
-- record still matches its list. Only rows with no value yet, which on a first run is all of
-- them: a re-run leaves an Admin's later edits alone.
UPDATE app.AssumptionConstraint
SET [Validated] = CASE WHEN [IsValidated] = 1 THEN N'Yes' ELSE N'No' END
WHERE [Validated] IS NULL;
GO
