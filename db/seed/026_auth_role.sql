-- Seed: the four fixed roles  / docs/PLAN.md §9). Idempotent MERGE.
USE ProjectManager;
GO
MERGE auth.Role AS t
USING (VALUES
    (N'Admin', 1),
    (N'ProjectManager', 2),
    (N'Contributor', 3),
    (N'Viewer', 4)
) AS s (Name, SortOrder)
ON t.Name = s.Name
WHEN NOT MATCHED THEN INSERT (Name, SortOrder) VALUES (s.Name, s.SortOrder);
GO
