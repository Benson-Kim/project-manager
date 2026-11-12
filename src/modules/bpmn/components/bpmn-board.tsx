"use client";

import {
  Background,
  ConnectionLineType,
  ConnectionMode,
  Panel,
  ReactFlow,
  useReactFlow,
  useStore,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodePositionChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { isEditableTarget } from "@/components/ui/data-view/datasheet";
import { Select } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { FLOW_KINDS, type FlowKind } from "../model/diagram";
import {
  addLane,
  connect,
  movePool,
  moveShapes,
  reconnect,
  removeElements,
  removeLane,
  renameLane,
  renamePool,
  resizeLane,
  resizePoolWidth,
  resizeShape,
  setFlowKind,
  setFlowLabel,
  setShapeLabel,
  type Point,
} from "../model/edit";
import { flowKindFor } from "../model/shapes";
import { BoardContext, type BoardActions } from "./board-context";
import { asSide, newId, toEdges, toNodes, type BoardNode } from "./board-model";
import { FlowEdge, FlowMarkers, type FlowFlowEdge } from "./flow-edge";
import { DRAG_TYPE, type PaletteItem } from "./palette";
import { PoolNode } from "./pool-node";
import { ShapeNode } from "./shape-node";
import type { DiagramEditor } from "./use-diagram-editor";

const M = messages.bpmn;

const nodeTypes = { shape: ShapeNode, pool: PoolNode };
const edgeTypes = { flow: FlowEdge };
const FIT_OPTIONS = { maxZoom: 1, padding: 0.1 } as const;
const THEME =
  "[--xy-background-color:var(--surface)] [--xy-background-pattern-dots-color:var(--line)] [--xy-edge-stroke:var(--ink-muted)] [--xy-edge-stroke-selected:var(--accent)] [--xy-handle-background-color:var(--surface-raised)] [--xy-handle-border-color:var(--line)] [--xy-connectionline-stroke-default:var(--accent)]";

export type BoardView = "board" | "full" | "preview";

function historyKey(event: React.KeyboardEvent): "undo" | "redo" | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y") return "redo";
  return null;
}

export interface BoardProps {
  editor: DiagramEditor;
  canEdit: boolean;
  view: BoardView;
  connector: FlowKind;
  selected: ReadonlySet<string>;
  onSelect: (update: (previous: ReadonlySet<string>) => Set<string>) => void;
  onPlace: (item: PaletteItem, at: Point) => void;
}

/** The drawing surface: symbols, pools and connectors, with the zoom and Undo controls. */
export function BpmnBoard({
  editor,
  canEdit,
  view,
  connector,
  selected,
  onSelect,
  onPlace,
}: BoardProps) {
  const { screenToFlowPosition, fitView, zoomIn, zoomOut } = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { diagram, change } = editor;

  const nodes = useMemo(() => toNodes(diagram, selected), [diagram, selected]);
  const edges = useMemo(() => toEdges(diagram, selected, canEdit), [diagram, selected, canEdit]);

  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => void fitView(FIT_OPTIONS));
    });
    return () => cancelAnimationFrame(frame);
  }, [view, fitView]);

  const actions = useMemo<BoardActions>(
    () => ({
      canEdit,
      editingId,
      startEdit: setEditingId,
      stopEdit: () => setEditingId(null),
      setShapeLabel: (id, text) => change((d) => setShapeLabel(d, id, text)),
      setFlowLabel: (id, text) => change((d) => setFlowLabel(d, id, text)),
      renamePool: (poolId, name) => change((d) => renamePool(d, poolId, name)),
      renameLane: (poolId, laneId, name) => change((d) => renameLane(d, poolId, laneId, name)),
      addLane: (poolId) =>
        change((d) => {
          const count = d.pools.find((pool) => pool.id === poolId)?.lanes.length ?? 0;
          return addLane(d, poolId, newId("lane"), M.laneName(count + 1));
        }),
      removeLane: (poolId, laneId) => change((d) => removeLane(d, poolId, laneId)),
      resizeLane: (poolId, laneId, height) => change((d) => resizeLane(d, poolId, laneId, height)),
      beginGesture: editor.beginGesture,
      endGesture: editor.endGesture,
    }),
    [canEdit, editingId, change, editor.beginGesture, editor.endGesture],
  );

  const select = (changes: { id: string; selected: boolean }[]) => {
    if (changes.length === 0) return;
    onSelect((previous) => {
      const next = new Set(previous);
      for (const each of changes) {
        if (each.selected) next.add(each.id);
        else next.delete(each.id);
      }
      return next;
    });
  };

  const onNodesChange = (changes: NodeChange<BoardNode>[]) => {
    select(changes.flatMap((c) => (c.type === "select" ? [c] : [])));
    if (!canEdit) return;
    const moves = changes.filter(
      (c): c is NodePositionChange & { position: Point } => c.type === "position" && !!c.position,
    );
    const sizes = changes.flatMap((c) =>
      c.type === "dimensions" && c.setAttributes && c.dimensions
        ? [{ id: c.id, ...c.dimensions }]
        : [],
    );
    if (moves.length === 0 && sizes.length === 0) return;
    change((d) => {
      const pools = new Set(d.pools.map((pool) => pool.id));
      const moving = new Set(moves.map((c) => c.id));
      const shapeMoves = new Map<string, Point>();
      let next = d;
      for (const move of moves) {
        if (pools.has(move.id)) next = movePool(next, move.id, move.position, moving);
        else shapeMoves.set(move.id, move.position);
      }
      next = moveShapes(next, shapeMoves);
      for (const size of sizes) {
        if (pools.has(size.id)) next = resizePoolWidth(next, size.id, size.width);
        else {
          const shape = next.shapes.find((each) => each.id === size.id);
          if (shape)
            next = resizeShape(next, size.id, {
              x: shape.x,
              y: shape.y,
              width: size.width,
              height: size.height,
            });
        }
      }
      return next;
    });
  };

  const onEdgesChange = (changes: EdgeChange<FlowFlowEdge>[]) =>
    select(changes.flatMap((c) => (c.type === "select" ? [c] : [])));

  const onConnect = (connection: Connection) =>
    change((d) => {
      const source = d.shapes.find((shape) => shape.id === connection.source);
      const target = d.shapes.find((shape) => shape.id === connection.target);
      if (!source || !target) return d;
      return connect(d, {
        id: newId("flow"),
        kind: flowKindFor(source.kind, target.kind, connector),
        source: source.id,
        target: target.id,
        sourceSide: asSide(connection.sourceHandle, "right"),
        targetSide: asSide(connection.targetHandle, "left"),
      });
    });

  const onReconnect = (old: FlowFlowEdge, connection: Connection) =>
    change((d) =>
      reconnect(d, old.id, {
        source: connection.source,
        target: connection.target,
        sourceSide: asSide(connection.sourceHandle, "right"),
        targetSide: asSide(connection.targetHandle, "left"),
      }),
    );

  const removeSelected = () => {
    if (!canEdit || selected.size === 0) return;
    change((d) => removeElements(d, selected));
    onSelect(() => new Set());
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const editable = isEditableTarget(event.target as HTMLElement);
    const shortcut = historyKey(event);
    if (shortcut && !editable) {
      event.preventDefault();
      if (canEdit) (shortcut === "undo" ? editor.undo : editor.redo)();
      return;
    }
    if (editable || event.defaultPrevented) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeSelected();
    } else if ((event.key === "F2" || event.key === "Enter") && canEdit && selected.size === 1) {
      event.preventDefault();
      setEditingId([...selected][0]!);
    } else if (event.key === "Escape" && selected.size > 0) {
      onSelect(() => new Set());
    }
  };

  const selectedFlows = diagram.flows.filter((flow) => selected.has(flow.id));
  const flowKind =
    selectedFlows.length > 0 && selectedFlows.every((f) => f.kind === selectedFlows[0]!.kind)
      ? selectedFlows[0]!.kind
      : "";

  return (
    <BoardContext.Provider value={actions}>
      <div className="relative h-full w-full" onKeyDown={onKeyDown}>
        <FlowMarkers />
        <ReactFlow<BoardNode, FlowFlowEdge>
          className={THEME}
          aria-label={M.canvasLabel}
          proOptions={{ hideAttribution: true }}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={canEdit ? onConnect : undefined}
          onReconnect={canEdit ? onReconnect : undefined}
          onNodeDragStart={editor.beginGesture}
          onNodeDragStop={editor.endGesture}
          onSelectionDragStart={editor.beginGesture}
          onSelectionDragStop={editor.endGesture}
          onEdgeDoubleClick={(_, edge) => {
            if (canEdit) setEditingId(edge.id);
          }}
          onPaneClick={() => setEditingId(null)}
          onDragOver={(event) => {
            if (!canEdit || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            const item = event.dataTransfer.getData(DRAG_TYPE) as PaletteItem;
            if (!canEdit || !item) return;
            event.preventDefault();
            onPlace(item, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
          }}
          isValidConnection={(connection) => connection.source !== connection.target}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.SmoothStep}
          nodesDraggable={canEdit}
          nodesConnectable={canEdit}
          edgesReconnectable={canEdit}
          elevateNodesOnSelect={false}
          elevateEdgesOnSelect={false}
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          snapToGrid
          snapGrid={[10, 10]}
          minZoom={0.1}
          maxZoom={2}
          fitView
          fitViewOptions={FIT_OPTIONS}
        >
          <Background />
          <Panel position="top-right" data-canvas-chrome className="print:hidden">
            <div
              role="toolbar"
              aria-label={M.canvasLabel}
              className="flex flex-wrap items-center justify-end gap-1"
            >
              {canEdit ? (
                <>
                  <Button
                    type="button"
                    size="compact"
                    variant="secondary"
                    data-testid="bpmn-undo"
                    disabled={!editor.canUndo}
                    onClick={editor.undo}
                  >
                    {M.undo}
                  </Button>
                  <Button
                    type="button"
                    size="compact"
                    variant="secondary"
                    data-testid="bpmn-redo"
                    disabled={!editor.canRedo}
                    onClick={editor.redo}
                  >
                    {M.redo}
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                size="compact"
                variant="secondary"
                aria-label={M.zoomOut}
                onClick={() => void zoomOut()}
              >
                −
              </Button>
              <span className="min-w-10 text-center text-xs text-ink-muted" aria-live="polite">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                type="button"
                size="compact"
                variant="secondary"
                aria-label={M.zoomIn}
                onClick={() => void zoomIn()}
              >
                +
              </Button>
              <Button
                type="button"
                size="compact"
                variant="secondary"
                onClick={() => void fitView(FIT_OPTIONS)}
              >
                {M.fit}
              </Button>
            </div>
            {canEdit && selected.size > 0 ? (
              <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
                {selectedFlows.length > 0 ? (
                  <div className="w-40">
                    <Select
                      aria-label={M.flowType}
                      data-testid="bpmn-flow-type"
                      value={flowKind}
                      onChange={(event) => {
                        const kind = event.target.value as FlowKind;
                        if (!kind) return;
                        change((d) =>
                          selectedFlows.reduce((acc, flow) => setFlowKind(acc, flow.id, kind), d),
                        );
                      }}
                    >
                      {flowKind ? null : <option value="">{M.flowType}</option>}
                      {FLOW_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {M.flows[kind]}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                <Button
                  type="button"
                  size="compact"
                  variant="secondary"
                  data-testid="bpmn-delete"
                  onClick={removeSelected}
                >
                  {M.deleteSelected}
                </Button>
              </div>
            ) : null}
          </Panel>
        </ReactFlow>
      </div>
    </BoardContext.Provider>
  );
}
