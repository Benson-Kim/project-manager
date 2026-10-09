-- Seed: the two global roles (ADR-0021: Admin | User; project rights come from
-- app.ProjectAssignee.AccessLevel). Idempotent MERGE.
USE ProjectManager;
GO
MERGE auth.Role AS t
USING (VALUES
    (N'Admin', 1),
    (N'User', 2)
) AS s (Name, SortOrder)
ON t.Name = s.Name
WHEN NOT MATCHED THEN INSERT (Name, SortOrder) VALUES (s.Name, s.SortOrder);
GO
