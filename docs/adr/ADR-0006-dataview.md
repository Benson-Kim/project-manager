# ADR-0006 — One shared DataView (grid/list) for every list module

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

At least 15 modules are "list of records for a project". If each builds its own list,
the app becomes 15 slightly different UIs and every fix is ×15.

## Decision

One shared `DataView` in `src/components/ui/data-view/` used by EVERY list module:

- **Two arrangements**: `grid` (cards) and `list` (table on ≥ md, stacked rows on
  mobile with column-priority hiding). The module supplies `renderCard`, `columns`
  (each with `priority: 1|2|3`; priority 1 always visible) and stable row ids.
- **View toggle** persisted per user per module: `usp_ViewPreference_Get/Set`
  (server-side, keyed `UserId + ModuleKey`) with a cookie fallback until auth (#4) and
  for instant first paint.
- **URL is the state**: `?q=&sort=&dir=&view=&page=` plus module filter params, parsed
  by a shared zod `listParamsSchema`. Server Components read `searchParams`, call the
  list proc (ADR-0016), and pass one page of rows + `totalCount` down. No client-side
  data fetching or client paging.
- **Interaction**: sticky toolbar (search, filters, sort, view toggle), roving-tabindex
  keyboard navigation, row selection with bulk-action bar, skeleton rows via
  `loading.tsx`, and the three states: `EmptyState` (no data at all), zero-result
  (search/filter matched nothing — offers "clear filters"), `ErrorState` (retry).
- Result counts are announced via the `LiveAnnouncer` (ADR-0008).

## Consequences

A list module ships: proc + repository + schemas + card/columns config + a page that
renders `<DataView>`. Modules MUST NOT fork DataView; missing capabilities are added to
the shared component in a dedicated MR.
