-- Seed realistic key deliverables for project 1 (Platform migration)
-- Window: 2024-12-12 → 2024-12-30
-- Gantt bar start = CreatedAtUtc (set explicitly via direct insert to spread bars)
-- Gantt bar end   = Deadline
-- ActorUserId 1 = admin (seeded in 027 seed)
USE ProjectManager;
SET NOCOUNT ON;

-- Clear any previous seed runs of THIS script (keeps the original row 8 intact)
DELETE FROM app.KeyDeliverable
WHERE ProjectId = 1
  AND KeyRequirement IN (
    N'Infrastructure assessment',
    N'Network topology design',
    N'Database migration plan',
    N'Security audit & hardening',
    N'Staging environment setup',
    N'Application containerisation',
    N'Data validation & integrity checks',
    N'Performance benchmarking',
    N'User acceptance testing',
    N'Cutover runbook finalised'
  );

-- Insert deliverables with explicit CreatedAtUtc so Gantt bars are spread
-- Columns: ProjectId, KeyRequirement, Deadline, Priority, Status, CreatedBy, CreatedAtUtc

INSERT INTO app.KeyDeliverable
    (ProjectId, KeyRequirement, Deadline, AssignedToStakeholderId, Priority, Status, CreatedBy, CreatedAtUtc)
VALUES
    (1, N'Infrastructure assessment',      '2024-12-14', NULL, N'Critical',  N'Completed',   1, '2024-12-12'),
    (1, N'Network topology design',        '2024-12-15', NULL, N'Important', N'Completed',   1, '2024-12-12'),
    (1, N'Database migration plan',        '2024-12-16', NULL, N'Critical',  N'Completed',   1, '2024-12-13'),
    (1, N'Security audit & hardening',     '2024-12-17', NULL, N'Critical',  N'In Progress', 1, '2024-12-13'),
    (1, N'Staging environment setup',      '2024-12-18', NULL, N'Important', N'In Progress', 1, '2024-12-14'),
    (1, N'Application containerisation',   '2024-12-20', NULL, N'Normal',    N'In Progress', 1, '2024-12-15'),
    (1, N'Data validation & integrity checks', '2024-12-22', NULL, N'Critical', N'Pending', 1, '2024-12-16'),
    (1, N'Performance benchmarking',       '2024-12-24', NULL, N'Important', N'Pending',     1, '2024-12-18'),
    (1, N'User acceptance testing',        '2024-12-27', NULL, N'Critical',  N'Pending',     1, '2024-12-20'),
    (1, N'Cutover runbook finalised',      '2024-12-30', NULL, N'Critical',  N'Pending',     1, '2024-12-23');

-- Verify
SELECT KeyDeliverableId, KeyRequirement, Deadline, Priority, Status
FROM app.KeyDeliverable
WHERE ProjectId = 1 AND IsDeleted = 0
ORDER BY Deadline;
