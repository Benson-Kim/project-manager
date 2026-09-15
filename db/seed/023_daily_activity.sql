-- Seed app.DailyActivity — ALL rows from docs/source/analysis/access-database.md §4 (tblDailyActivityList).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
-- Source StatusID is 0 on every row → ActivityStatusId NULL; Attachment refs dropped (module #22).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.DailyActivity ON;

INSERT INTO app.DailyActivity ([DailyActivityId], [ProjectId], [ActivityStatusId], [Requester], [Task], [MyActivity], [ActivityDate], [Comments], [RequestDate], [Status], [CompleteDate], [ContactMethod], [TimeSpent], [AssignedTo], [TaskType], [Progress], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 2, NULL, N'Borton', N'Hello, kindly let us meet today evening', NULL, NULL, NULL, N'2024-12-14', N'Active', NULL, N'Questions I have', NULL, NULL, NULL, NULL, 0),
    (2, 2, NULL, N'Borton', N'Forms Editing', N'Continue with editing forms', N'2025-02-20', N'Need to work extra fast', N'2024-12-14', N'Pending', NULL, N'Questions I have', NULL, NULL, NULL, NULL, 0),
    (3, 2, NULL, N'Prius', N'Relink Database tables', N'Hello, kindly let us meet today evening', NULL, NULL, N'2024-10-08', N'Urgent', NULL, N'Meeting', NULL, NULL, NULL, NULL, 0),
    (4, 1, NULL, N'Marin', N'Try to use it and see how it works', N'Looks like a cool thing to try it', N'2024-12-16', NULL, N'2024-12-15', N'Pending', NULL, N'In Person', NULL, NULL, NULL, NULL, 0),
    (5, 1, NULL, N'James', N'Work on remaining reports that are incomplete', N'Checked if they are working, but not all are working', N'2024-12-17', NULL, N'2024-12-14', N'Pending', NULL, N'Text Message', NULL, NULL, NULL, NULL, 0),
    (6, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0),
    (7, 2, NULL, N'Andrew', N'Create a crypto token landing page using nextjs', NULL, NULL, NULL, N'2024-12-17', N'Active', NULL, N'Telephone', NULL, NULL, NULL, NULL, 0),
    (8, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0),
    (9, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0),
    (10, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0),
    (11, 2, NULL, N'James', N'Assign all objects', N'None', N'2024-12-29', NULL, N'2024-12-27', N'Not in List', NULL, N'Telephone', NULL, NULL, NULL, NULL, 0),
    (12, 27, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, 0, 0),
    (13, 25, NULL, N'Borton', N'Check why Add Activity throws an error', N'Debug the form to ensure it does not throw the error, and user can add daily activity easily', N'2025-01-01', NULL, N'2024-12-31', N'Pending', NULL, N'To do', 1, N'1', N'Technical', 50, 0)
) AS s ([DailyActivityId], [ProjectId], [ActivityStatusId], [Requester], [Task], [MyActivity], [ActivityDate], [Comments], [RequestDate], [Status], [CompleteDate], [ContactMethod], [TimeSpent], [AssignedTo], [TaskType], [Progress], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.DailyActivity t WHERE t.[DailyActivityId] = s.[DailyActivityId]);

SET IDENTITY_INSERT app.DailyActivity OFF;
GO
