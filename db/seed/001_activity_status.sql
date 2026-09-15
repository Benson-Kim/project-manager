-- Seed migrated from the Access database (status vocabulary observed in
-- tblDailyActivityList / tblTodoList / Excel checklist validation list).
USE ProjectManager;
GO
MERGE app.ActivityStatus AS t
USING (VALUES
    (N'Not Started', 1),
    (N'In Progress', 2),
    (N'Completed', 3),
    (N'Cancelled', 4)
) AS s (Name, SortOrder)
ON t.Name = s.Name
WHEN NOT MATCHED THEN INSERT (Name, SortOrder) VALUES (s.Name, s.SortOrder);
GO
