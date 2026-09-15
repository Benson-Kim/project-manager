-- Seed app.MeetingAgendaItem — ALL rows from docs/source/analysis/access-database.md §4 (tblMeetingAgenda).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.MeetingAgendaItem ON;

INSERT INTO app.MeetingAgendaItem ([MeetingAgendaItemId], [MeetingId], [AgendaItem], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 2, N'Effective replenishment processing', 0),
    (2, 2, N'Demand forecasting', 0),
    (3, NULL, N'Fill stock quantity replenishment', 0)
) AS s ([MeetingAgendaItemId], [MeetingId], [AgendaItem], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.MeetingAgendaItem t WHERE t.[MeetingAgendaItemId] = s.[MeetingAgendaItemId]);

SET IDENTITY_INSERT app.MeetingAgendaItem OFF;
GO
