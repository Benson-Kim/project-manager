-- 019_view_preference_layout.sql
-- Datasheet layout (ADR-0023): each user's arrangement of a list module's table, stored next to
-- the grid/list view mode it belongs to. Layout is a JSON object (validated by the app's
-- listLayoutSchema), all members optional:
--   {"order": ["Status","Task"], "widths": {"Task": 320}, "rowHeight": 64}
--   order     — column keys in display order (missing columns keep their default place)
--   widths    — column widths in pixels, by column key (dragged header edges)
--   rowHeight — the height of every row in pixels (a dragged row edge, Access-style)
-- NULL = the module's default layout. Keys the module no longer has are ignored, so the stored
-- value never needs a data migration. Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.ViewPreference', N'Layout') IS NULL
    ALTER TABLE app.ViewPreference
        ADD Layout NVARCHAR(2000) NULL;
GO

IF OBJECT_ID(N'app.CK_ViewPreference_Layout', N'C') IS NULL
    ALTER TABLE app.ViewPreference
        ADD CONSTRAINT CK_ViewPreference_Layout
        CHECK (Layout IS NULL OR (ISJSON(Layout) = 1 AND LEFT(Layout, 1) = N'{'));
GO
