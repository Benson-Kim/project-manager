# ADR-0064: BPMN diagrams

- Status: Accepted. Choices not in the client's request are ours and can be changed.
- Date: 2026-11-12
- Module: bpmn (new). Builds on ADR-0021, ADR-0024 and ADR-0061

## Context

The client asked for a BPMN tool that "functions in the same capacity as Dynamic Requirements": click
BPMN 2.0 symbols onto a canvas, link them with connector arrows that can carry text, and add as many
swimlanes with headings as wanted. Their symbol sheet lists start, message start, timer start,
intermediate, timer intermediate, error intermediate, end and terminate end events; task, user,
service and script tasks, sub-process and call activity; exclusive, parallel, inclusive and
event-based gateways; sequence, message and default flows; data object and text annotation. Their
menu puts BPMN under Workspace, after the whiteboard and before meeting minutes.

## Decision

### 1. Library: `@xyflow/react`, not bpmn-js

bpmn-js is the reference BPMN editor, but its licence requires the bpmn.io watermark to stay visible
and unchanged on every rendered diagram, it adds about 190 KB of minified script plus diagram-js's
own stylesheet and icon font, and it draws in its own look, outside the app's theme and dark mode.
`@xyflow/react` (MIT, pinned 12.12.0) already ships for the requirement canvas (ADR-0061), so the
BPMN tool adds no dependency, works offline in the desktop app, and shares pan, zoom, selection,
connection handles and the print stylesheet with the canvas. The symbols are our own SVG.

### 2. One JSON document per diagram (migration 072)

`app.BpmnDiagram`: `BpmnDiagramId` identity, `ProjectId`, `Name NVARCHAR(120)`, `DiagramJson
NVARCHAR(MAX)`, the module's soft-delete and audit columns, `RowVer`. Names are unique per project
among rows not deleted. Checks hold `DiagramJson` to valid JSON of at most 300,000 characters.

A diagram is drawn as a whole and has no meaning row by row, unlike the canvas, which is a view over
register rows. So the drawing is one document, written whole under the row version: two people on one
diagram get a 409 instead of overwriting each other, and Undo is a step back to the previous document.

```ts
type BpmnDiagram = {
  version: 1;
  pools: { id; name; x; y; width; lanes: { id; name; height }[] }[];
  shapes: { id; kind: ShapeKind; x; y; width; height; label }[];
  flows: { id; kind: "sequence" | "message" | "default" | "association";
           source; target; sourceSide; targetSide; label }[];
};
```

Positions are absolute. A pool's height is the sum of its lanes, and lane membership is never stored:
a shape is in the lane its centre falls in, so the two cannot disagree. Moving a pool moves the shapes
inside it; growing a lane moves the lanes below and their shapes; deleting a pool leaves its shapes.

`src/modules/bpmn/model/diagram.ts` is the one schema: strict objects at every level, ids that are
valid XML ids, labels up to 500 characters, names up to 120, whole-number coordinates within
±100,000, at most 1,000 shapes, 2,000 flows, 50 pools and 50 lanes a pool, unique ids, flows only
between shapes that exist, and the 300,000-character total. The save action validates the document
against it before the proc sees it.

### 3. Server contract

Procs live in `db/procs/bpmn-diagram/`, take the project from the row and answer through
`usp_Project_AssertAccess`, so an id from another project is refused (object-level access).

| Proc | Purpose |
|---|---|
| `usp_BpmnDiagram_List @ProjectId` | Id, name and version, without drawings |
| `usp_BpmnDiagram_GetById` | One diagram with its drawing |
| `usp_BpmnDiagram_Create`, `_Rename` | Name checked by `_AssertName` inside the project lock |
| `usp_BpmnDiagram_Update` | Saves the drawing; refuses non-JSON, another document version, missing lists and anything over 300,000 characters |
| `usp_BpmnDiagram_Delete` | Soft delete under the row version |

Permission module `bpmn`: Viewer reads, Contributor creates, renames and saves, Manager deletes, and
a manager can grant or revoke each verb per person (ADR-0024). Create, rename and delete are audited
with the name; a save is audited with element counts only, so the log never copies a drawing.

### 4. Editor

One page, `src/app/(app)/projects/[id]/bpmn/page.tsx`, with `?diagram=<id>` matched against the
project's own list. The palette places a symbol in the middle of the view on click, or where it is
dropped. Each symbol has a dot on every side; dragging from one to another symbol connects them with
the connector type picked in the palette, and data and notes always join by association. Double-click
writes on a symbol, a connector, a pool heading or a lane heading. Delete removes the selection;
Ctrl+Z and Ctrl+Y step through the last 30 changes (the shared `UNDO_LIMIT`), and a drag or resize is
one step. The editor saves a moment after each change, one save at a time, each under the version the
last one returned; a conflict stops saving and offers a reload.

Pools sit under connectors and connectors under symbols. Only a pool's heading strips take the
pointer, so a click inside a lane reaches the connectors and the canvas beneath.

### 5. Print and export

`model/svg.ts` draws the whole diagram as SVG from the model, in fixed print colours, using the same
symbol primitives and connector routes as the screen. Print and print preview show it on the canvas
print page (A4 landscape); PNG export rasterises it at twice its size. `model/bpmn-xml.ts` writes
BPMN 2.0 XML with DI: each pool a participant with its own process and lane set, shapes outside
every pool in one more process, message flows in the collaboration, default flows as the source's
`default`, and right-angled waypoints.

### 6. Left out on purpose

Live updates between two open editors, version history beyond Undo, BPMN import, collapsed pools as
message flow ends, and boundary events.

## Consequences

- A save sends the whole document, bounded at 300,000 characters, which stays under the server action
  body limit.
- A stored document that no longer parses opens read-only, so nothing overwrites it.
- Symbols added later are one entry in `shapes.ts` and one in the XML element table.
