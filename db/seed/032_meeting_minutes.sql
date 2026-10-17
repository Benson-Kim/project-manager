-- Seed: meeting rows from before migration 024 get their positions and the action items' meeting
-- here. Seeds run after the migrations, so this covers rows that existed before 024 and rows seeds
-- 009-012 inserted on a new database.
--   MeetingActionItem.AgendaItemId: taken from the discussion point when only that is set.
--   MeetingActionItem.MeetingId: the meeting of its discussion point's agenda item, else of its
--     agenda item. Actions with neither stay without a meeting (Admins still see them).
--   SortOrder: by id within each meeting (agenda items), agenda item (discussion points) and
--     discussion point or agenda item (action items), after any row already placed.
-- Idempotent: only rows still without a meeting or a position match.
USE ProjectManager;
GO
UPDATE ai SET AgendaItemId = dp.AgendaItemId
FROM app.MeetingActionItem AS ai
JOIN app.MeetingDiscussionPoint AS dp ON dp.MeetingDiscussionPointId = ai.DiscussionPointId
WHERE ai.AgendaItemId IS NULL;
GO

UPDATE ai SET MeetingId = COALESCE(dpa.MeetingId, a.MeetingId)
FROM app.MeetingActionItem AS ai
LEFT JOIN app.MeetingDiscussionPoint AS dp ON dp.MeetingDiscussionPointId = ai.DiscussionPointId
LEFT JOIN app.MeetingAgendaItem AS dpa ON dpa.MeetingAgendaItemId = dp.AgendaItemId
LEFT JOIN app.MeetingAgendaItem AS a ON a.MeetingAgendaItemId = ai.AgendaItemId
WHERE ai.MeetingId IS NULL
  AND COALESCE(dpa.MeetingId, a.MeetingId) IS NOT NULL;
GO

WITH unplaced AS (
    SELECT a.SortOrder,
           ROW_NUMBER() OVER (PARTITION BY a.MeetingId ORDER BY a.MeetingAgendaItemId) AS Position,
           ISNULL((SELECT MAX(s.SortOrder) FROM app.MeetingAgendaItem AS s
                   WHERE s.SortOrder > 0
                     AND (s.MeetingId = a.MeetingId OR (s.MeetingId IS NULL AND a.MeetingId IS NULL))),
                  0) AS Placed
    FROM app.MeetingAgendaItem AS a
    WHERE a.SortOrder = 0
)
UPDATE unplaced SET SortOrder = Placed + Position;
GO

WITH unplaced AS (
    SELECT dp.SortOrder,
           ROW_NUMBER() OVER (PARTITION BY dp.AgendaItemId ORDER BY dp.MeetingDiscussionPointId) AS Position,
           ISNULL((SELECT MAX(s.SortOrder) FROM app.MeetingDiscussionPoint AS s
                   WHERE s.SortOrder > 0 AND s.AgendaItemId = dp.AgendaItemId),
                  0) AS Placed
    FROM app.MeetingDiscussionPoint AS dp
    WHERE dp.SortOrder = 0
)
UPDATE unplaced SET SortOrder = Placed + Position;
GO

WITH unplaced AS (
    SELECT ai.SortOrder,
           ROW_NUMBER() OVER (PARTITION BY ai.MeetingId, ai.AgendaItemId, ai.DiscussionPointId
                              ORDER BY ai.MeetingActionItemId) AS Position,
           ISNULL((SELECT MAX(s.SortOrder) FROM app.MeetingActionItem AS s
                   WHERE s.SortOrder > 0
                     AND (s.MeetingId = ai.MeetingId OR (s.MeetingId IS NULL AND ai.MeetingId IS NULL))
                     AND (s.AgendaItemId = ai.AgendaItemId OR (s.AgendaItemId IS NULL AND ai.AgendaItemId IS NULL))
                     AND (s.DiscussionPointId = ai.DiscussionPointId
                          OR (s.DiscussionPointId IS NULL AND ai.DiscussionPointId IS NULL))),
                  0) AS Placed
    FROM app.MeetingActionItem AS ai
    WHERE ai.SortOrder = 0
)
UPDATE unplaced SET SortOrder = Placed + Position;
GO
