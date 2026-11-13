-- 075_bpmn_step_status.sql — A process step's status becomes a managed list an Admin can edit and
-- colour, like the other dropdowns. A step is held inside the diagram's JSON document, so it stores
-- the option id rather than the label: renaming a status then needs no rewrite of any diagram.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

MERGE app.LookupList AS t
USING (VALUES (N'bpmn.step-status')) AS s (ListKey)
ON t.ListKey = s.ListKey
WHEN NOT MATCHED THEN INSERT (ListKey) VALUES (s.ListKey);
GO

DECLARE @Seed TABLE (ListKey NVARCHAR(64), Label NVARCHAR(50), SortOrder INT, IsLocked BIT);
INSERT INTO @Seed (ListKey, Label, SortOrder, IsLocked) VALUES
    (N'bpmn.step-status', N'Pending',   1, 0),
    (N'bpmn.step-status', N'Active',    2, 0),
    (N'bpmn.step-status', N'Completed', 3, 0),
    (N'bpmn.step-status', N'Blocked',   4, 0);

-- Matching on the label never resurrects an option an Admin removed.
MERGE app.LookupOption AS t
USING @Seed AS s
ON t.ListKey = s.ListKey AND t.Label = s.Label
WHEN NOT MATCHED THEN INSERT (ListKey, Label, SortOrder, IsLocked, CreatedBy)
                      VALUES (s.ListKey, s.Label, s.SortOrder, s.IsLocked, 0);
GO
