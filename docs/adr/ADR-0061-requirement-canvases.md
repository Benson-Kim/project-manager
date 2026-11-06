# ADR-0061: Requirement canvases

- Status: Accepted. Choices not in the client's answers are ours and can be changed.
- Date: 2026-11-06
- Module: requirements (#10). Builds on ADR-0037 and ADR-0060

## Context

The client wants a canvas beside WBS and Gantt, and beside New requirement on the register. Their answers: the canvas is a view; hand-arranged positions persist and auto layout applies otherwise; dragging a card onto it only reveals the item; existing app rules decide who can change what; at 300 nodes it needs clustering, collapsing by parent and a neighbourhood view. Their example shows three panes: repository list, canvas, inspector.

## Decision

### 1. A canvas is a view

The register stays the source of truth. Removing a node never removes a requirement or a link. A project can have many canvases, and a canvas can be filed under one WBS item, so a WBS item can have several. Only Active and Proposed links draw: Proposed is dashed and Retired is not shown.

### 2. Tables (migration 064; test runs move to 065)

`app.RequirementCanvas`: `RequirementCanvasId` identity, `ProjectId`, `KeyDeliverableId` null, `Name NVARCHAR(120)`, `IsDeleted`, `CreatedAtUtc`, `CreatedBy`, `UpdatedAtUtc`, `UpdatedBy`, `RowVer`. Names are unique per project among rows not deleted.

`app.RequirementCanvasNode`: identity key, `RequirementCanvasId`, `RequirementId` null, `KeyDeliverableId` null, `X INT` null, `Y INT` null, `IsCollapsed BIT`, `CreatedAtUtc`, `CreatedBy`, `UpdatedAtUtc`. A check holds exactly one of the two item columns, and two filtered unique indexes hold one node per item per canvas. Requirement and WBS items can both be nodes.

Null `X, Y` means auto layout places the node; a value means someone arranged it by hand. Auto layout clears the values for the canvas, and states that consequence first.

### 3. Server contract

All procs live in `db/procs/requirement/`, take their project from the row, and answer through `usp_Project_AssertAccess`. Levels follow the verbs in `proc-access-levels.test.ts`. A canvas delete uses `requirements:delete`, the same rule as any delete in the module.

| Proc | Purpose |
|---|---|
| `usp_RequirementCanvas_List @ProjectId` | Canvases with `NodeCount` |
| `usp_RequirementCanvas_Create`, `_Update`, `_Delete` | `_Update` and `_Delete` take `@RowVer`; delete is soft |
| `usp_RequirementCanvas_Items @RequirementCanvasId` | Every requirement and WBS item in the project, with `OnCanvas`, `X`, `Y`, `IsCollapsed` |
| `usp_RequirementCanvas_Links @RequirementCanvasId` | Every drawable link in the project, both kinds, with `RowVer` |
| `usp_RequirementCanvasNode_Add` | Reveal one item. Repeating it succeeds and changes nothing. The item must be in the canvas's project |
| `usp_RequirementCanvasNode_Move @NodesJson` | Batch of positions and collapse flags through typed `OPENJSON`, at most 2,000 rows. Null clears a position |
| `usp_RequirementCanvasNode_Remove` | Hide one item |
| `usp_Requirement_Allocate` | Add one WBS link with the rule check. Today's WBS write replaces the whole list, which two people on a canvas would race |

Requirement links use the existing `usp_RequirementLink_Create`, `_Update` and `_Delete`, and WBS removal uses `usp_Requirement_Unallocate`, so rules, loop checks and audit have one home.

`Items` and `Links` return a whole project on purpose: the left pane lists everything and a reveal must not cost a round trip. The size is bounded by one project, and `Items` sends `LEFT(Description, 400)`, so a 6,000-character field does not travel. The client treats that text as plain and never renders it as HTML.

TypeScript contract, in `src/modules/requirements/schemas/canvas.ts`:

```ts
type CanvasSummary = {
  RequirementCanvasId: number; Name: string; KeyDeliverableId: number | null;
  NodeCount: number; RowVer: number;
};
type CanvasItem = {
  Kind: "Requirement" | "Wbs"; ItemId: number; Ref: string; Type: RequirementType | "WBS";
  Title: string; Summary: string | null; Status: string | null; ParentId: number | null;
  OnCanvas: boolean; X: number | null; Y: number | null; IsCollapsed: boolean;
};
type CanvasLink = {
  UpstreamKind: "Requirement" | "Wbs"; UpstreamId: number; DownstreamId: number;
  LinkStatus: "Proposed" | "Active"; RowVer: number;
};
```

Requirements have no description column, so on a requirement `Title` is the requirement text and `Summary` its acceptance criteria; on a WBS item they are its name and note. Both are cut to 400 characters and are for display only: an edit reads the row by id. `Status` is `Met` or `NotMet` on a requirement and the item's own status on a WBS item. `Ref` on a WBS item is its code, such as `1.2`.

`usp_RequirementCanvasNode_Add` takes optional `@X` and `@Y`, so a drop lands where it was dropped. Each row of `@NodesJson` is `{kind, itemId, x, y, isCollapsed}` with every key required, so an omitted value is refused and never reads as a cleared one.

`usp_Requirement_Allocate` reads the list under the project lock and hands it to `usp_Requirement_ReplaceAllocations`, so that proc stays the one home of the allocation rules.

Beyond section 2's columns, the node table carries `ProjectId` with composite foreign keys, which keep the canvas, its filing and every node inside one project at database level. A position check holds `X` and `Y` both set or both null, and the canvas table has the module's `DeletedAtUtc` and `DeletedBy`.

Actions: `createCanvasAction`, `updateCanvasAction`, `deleteCanvasAction`, `addCanvasNodeAction`, `moveCanvasNodesAction`, `removeCanvasNodeAction`, `allocateRequirementAction`.

### 4. Positions are not versioned or audited

A record two people edit normally carries a version. Node rows are the exception: a stale position harms nothing, a 409 on every drag would make the canvas unusable, and an audit row per drag would bury real changes. The last drag wins. Canvas create, rename and delete are audited.

### 5. Library

`@xyflow/react`, MIT, pinned to an exact version, with the lockfile from `npx npm@10`. A hand-written SVG canvas would have to rebuild pan, zoom, selection, connection handles and viewport culling. `onlyRenderVisibleElements` covers large graphs.

Layout is our own pure function, `src/modules/requirements/canvas/layout.ts`: rank by longest path from upstream, so skipped levels sit correctly, then order within a rank by the average position of neighbours. It ends because ADR-0060 forbids loops. No layout dependency is added.

### 6. Linking

Each node has separate upstream and downstream handles, on the left and right. Dragging handle to handle, or the right-click menu, makes a link. The rule table dims invalid targets, and the server still decides: a refusal shows its message and no edge is left behind.

The inspector reuses `requirement-links.tsx` for the upstream and downstream lists, so link fields live in one place and keyboard users have a way to link without dragging.

### 7. Gaps

`canvasGaps` is a pure function giving `missingTest` and `noDownstream` from Active links. Gaps inform and never block. Test runs (ADR-0060 section 6) will later change what counts as tested, in that one function.

### 8. Create, print, scale

Create from the canvas opens the existing requirement form. A title that matches an item in the project warns before saving and can be overridden. Print uses a print stylesheet, preview shows that same view on screen, and full page hides the app frame.

Clustering, collapse by parent and neighbourhood are pure functions over `CanvasItem` and `CanvasLink`. Collapse persists through `IsCollapsed`; neighbourhood is a viewing state and is not saved.

- **Cluster:** the top-level WBS item an item traces to. A WBS item climbs its own parents. A requirement walks upstream through its links and its parent to the nearest WBS item, the first in WBS order on a tie. An item that traces to none has no cluster.
- **Collapse:** goes by `ParentId` within one kind. A collapsed node on the canvas hides the on-canvas items below it, and their links are redrawn on it, one per pair.
- **Neighbourhood:** the focus with the items up to a chosen number of links upstream and downstream. Each walk keeps one direction, so a sibling that shares a parent is not a neighbour.

### 9. Routes

One page, `src/app/(app)/projects/[id]/deliverables/canvas/page.tsx`, with `?canvas=<id>`. WBS, Gantt and the register button all link to it. Components live in `src/modules/requirements/components/canvas/`.

### 10. Left out on purpose

Live updates between two open canvases, canvas version history, and per-canvas permissions.

## Consequences

- One whole-project read per open canvas. If projects grow well past thousands of rows, `Items` needs paging for the left pane.
- A new client dependency. The CSP must allow its inline styles; check this when installing.
- `usp_Requirement_Allocate` joins the rule-checked write procs, so ADR-0060's guardrails must cover it.

## Build slices

C0 to C9 are tracked in the relay hand-off. C2 and C3 are this ADR's server half; C4 to C6 are the page and linking; C7 and C8 finish sections 8 and 9.
