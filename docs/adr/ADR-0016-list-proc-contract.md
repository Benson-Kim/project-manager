# ADR-0016 — List stored-procedure contract

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

DataView (ADR-0006) needs identical paging/sorting/search semantics from every list
proc; ad-hoc signatures would push logic into the app layer.

## Decision

Every `usp_<Entity>_List` has this exact shape:

```sql
CREATE OR ALTER PROCEDURE app.usp_Entity_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,  -- module scope filter where applicable
    @Search      NVARCHAR(100) = NULL,  -- LIKE '%…%' over the entity's named text columns
    @SortBy      NVARCHAR(50)  = NULL,  -- whitelist via CASE; default = entity's natural order
    @SortDir     VARCHAR(4)    = 'asc', -- 'asc' | 'desc'
    @Page        INT           = 1,
    @PageSize    INT           = 25     -- clamped 1..100 in the proc
    -- + module-specific filter params, each NULLable
```

- Returns ONE result set: the page rows plus `TotalCount = COUNT(*) OVER ()` and
  `RowVer` (ADR-0011). `OFFSET … FETCH` paging. `IsDeleted = 0` always filtered.
- `@SortBy` is validated against an explicit CASE whitelist inside the proc — never
  dynamic SQL from input. Unknown values fall back to the default order. Every
  whitelisted sort column is backed by an index chosen for the common access path
  (typically `(ProjectId, IsDeleted) INCLUDE (…)`).
- The shared zod `listParamsSchema` (`src/lib/list-params.ts`) parses/clamps the URL
  params to this contract; repositories forward them 1:1.
- Search behaviour: case-insensitive substring; which columns participate is documented
  in the proc header comment and the module issue.

## Consequences

One pagination implementation in SQL, one in TypeScript; DataView works against any
compliant proc with zero module-specific glue.
