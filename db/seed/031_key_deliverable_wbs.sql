-- Seed: key deliverables without a WBS place or start date (migration 032) get them here. Seeds run
-- after the migrations, so this covers rows that existed before 032 and rows seeds 004/006
-- inserted on a new database.
--   StartDate: where the old Gantt started the bar: RequestedDate, else the creation day, else the
--     project start, else the deadline.
--   SortOrder: top-level order by deadline (undated last), after any item already placed.
-- Idempotent: only rows still without a start date or a position match.
USE ProjectManager;
GO
UPDATE kd
SET StartDate = CASE
        WHEN kd.RequestedDate IS NOT NULL
             AND (kd.Deadline IS NULL OR kd.RequestedDate <= kd.Deadline) THEN kd.RequestedDate
        WHEN kd.Deadline IS NULL
             OR CAST(CAST(kd.CreatedAtUtc AS DATE) AS DATETIME2) <= kd.Deadline
            THEN CAST(CAST(kd.CreatedAtUtc AS DATE) AS DATETIME2)
        WHEN p.StartDate IS NOT NULL AND p.StartDate <= kd.Deadline THEN p.StartDate
        ELSE kd.Deadline
    END
FROM app.KeyDeliverable AS kd
LEFT JOIN app.Project AS p ON p.ProjectId = kd.ProjectId
WHERE kd.StartDate IS NULL;
GO

WITH unplaced AS (
    SELECT kd.SortOrder,
           ROW_NUMBER() OVER (
               PARTITION BY kd.ProjectId, kd.ParentKeyDeliverableId
               ORDER BY CASE WHEN kd.Deadline IS NULL THEN 1 ELSE 0 END, kd.Deadline,
                        kd.KeyDeliverableId) AS Position,
           ISNULL((SELECT MAX(s.SortOrder) FROM app.KeyDeliverable AS s
                   WHERE s.SortOrder > 0
                     AND (s.ProjectId = kd.ProjectId OR (s.ProjectId IS NULL AND kd.ProjectId IS NULL))
                     AND (s.ParentKeyDeliverableId = kd.ParentKeyDeliverableId
                          OR (s.ParentKeyDeliverableId IS NULL AND kd.ParentKeyDeliverableId IS NULL))),
                  0) AS Placed
    FROM app.KeyDeliverable AS kd
    WHERE kd.SortOrder = 0
)
UPDATE unplaced SET SortOrder = Placed + Position;
GO
