"use client";

import {
  applyNodeChanges,
  Background,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  ViewportPortal,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { messages } from "@/lib/messages";
import {
  boardEdges,
  boardNodes,
  clusterLabels,
  collapsibleKeys,
  focusKeys,
  linkEnds,
  mergeFlowNodes,
  unlinkableKeys,
  withHidden,
  type Focus,
  type LinkStart,
  type ItemNode,
} from "../../canvas/board-model";
import { LinkMenu } from "./link-menu";
import type { CanvasGaps } from "../../canvas/gaps";
import { canvasClusters, collapsedView } from "../../canvas/scale";
import type { Point } from "../../canvas/layout";
import type { CanvasItem, CanvasLink } from "../../schemas/canvas";
import { BoardContext, ItemNodeView } from "./item-node";
import { NodeMenu } from "./node-menu";

const M = messages.requirements.canvas;

export const CANVAS_ITEM_MIME = "application/x-canvas-item";

const nodeTypes = { item: ItemNodeView };
const SAVE_DELAY_MS = 300;
/**
 * Fit options shared by every fitView call. maxZoom 1 keeps a one- or two-node board at actual
 * size instead of letting the default (200%) blow a single card up until later-added cards fall
 * outside the viewport — where `onlyRenderVisibleElements` would drop them from the DOM.
 */
const FIT_OPTIONS = { maxZoom: 1 } as const;
const THEME =
  "[--xy-background-color:var(--surface)] [--xy-background-pattern-dots-color:var(--line)] [--xy-edge-stroke:var(--ink-muted)] [--xy-edge-stroke-selected:var(--accent)] [--xy-handle-background-color:var(--surface-raised)] [--xy-handle-border-color:var(--line)]";

/** The board in the page, filling the window, or as the one page it prints on. */
export type CanvasView = "board" | "full" | "preview";

const PRINT_SETTLE_MS = 300;

interface BoardProps {
  view: CanvasView;
  printRequest: number;
  items: readonly CanvasItem[];
  links: readonly CanvasLink[];
  gaps: ReadonlyMap<string, CanvasGaps>;
  canEdit: boolean;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onMove: (moves: readonly ({ id: string } & Point)[]) => void;
  onHide: (item: CanvasItem) => void;
  onDropItem: (key: string, point: Point) => void;
  onAutoLayout: () => void;
  canLink: (sourceKey: string, targetKey: string) => boolean;
  onLink: (sourceKey: string, targetKey: string) => void;
  onUnlink: (link: CanvasLink) => void;
  onInspect: (requirementId: number) => void;
  onToggleCollapse: (item: CanvasItem) => void;
}

/** Where a right-click opened the menu, or under the element when the keyboard opened it. */
function menuPoint(event: React.MouseEvent): Point {
  if (event.clientX !== 0 || event.clientY !== 0) return { x: event.clientX, y: event.clientY };
  const { left, bottom } = (event.currentTarget as Element).getBoundingClientRect();
  return { x: left, y: bottom };
}

function Toolbar({
  items,
  canEdit,
  onAutoLayout,
}: Pick<BoardProps, "items" | "canEdit" | "onAutoLayout">) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const [confirming, setConfirming] = useState(false);
  const handPlaced = items.some((item) => item.OnCanvas && item.X !== null);

  return (
    <Panel position="top-right" data-canvas-chrome className="flex items-center gap-1 print:hidden">
      {canEdit ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => (handPlaced ? setConfirming(true) : onAutoLayout())}
        >
          {M.autoLayout}
        </Button>
      ) : null}
      <Button type="button" variant="secondary" aria-label={M.zoomOut} onClick={() => zoomOut()}>
        −
      </Button>
      <span className="min-w-12 text-center text-xs text-ink-muted">{Math.round(zoom * 100)}%</span>
      <Button type="button" variant="secondary" aria-label={M.zoomIn} onClick={() => zoomIn()}>
        +
      </Button>
      <Button type="button" variant="secondary" onClick={() => fitView(FIT_OPTIONS)}>
        {M.reset}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={M.autoLayout}
        body={M.autoLayoutBody}
        confirmLabel={M.autoLayout}
        onConfirm={() => {
          setConfirming(false);
          onAutoLayout();
        }}
      />
    </Panel>
  );
}

function Board(props: BoardProps) {
  const { items, links, gaps, canEdit, selectedKey, onSelect, onHide, onDropItem } = props;
  const { screenToFlowPosition, fitView } = useReactFlow();
  const { hiddenBy, hiddenCount } = useMemo(() => collapsedView(items), [items]);
  const collapsible = useMemo(() => collapsibleKeys(items), [items]);
  const [focus, setFocus] = useState<Focus | null>(null);
  const shownKeys = useMemo(() => focusKeys(focus, links, hiddenBy), [focus, links, hiddenBy]);
  const wanted = useMemo(
    () => withHidden(boardNodes(items, links, selectedKey), hiddenBy, shownKeys),
    [items, links, selectedKey, hiddenBy, shownKeys],
  );
  const focusOn = (next: Focus | null) => {
    setFocus(next);
    void fitView({ ...FIT_OPTIONS, duration: 200 });
  };
  const edges = useMemo(() => boardEdges(items, links, hiddenBy), [items, links, hiddenBy]);
  const [nodes, setNodes] = useState(wanted);
  const [seen, setSeen] = useState(wanted);
  if (seen !== wanted) {
    setSeen(wanted);
    setNodes(mergeFlowNodes(wanted, nodes));
  }
  const clusters = useMemo(() => canvasClusters(items, links), [items, links]);
  const labels = useMemo(() => clusterLabels(items, nodes, clusters), [items, nodes, clusters]);

  const unsaved = useRef(new Map<string, { id: string } & Point>());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onMove = useRef(props.onMove);
  useEffect(() => {
    onMove.current = props.onMove;
  });
  const flush = useRef(() => {
    clearTimeout(timer.current);
    if (unsaved.current.size === 0) return;
    onMove.current([...unsaved.current.values()]);
    unsaved.current = new Map();
  });
  useEffect(() => flush.current, []);

  const { view, printRequest } = props;
  const printed = useRef(printRequest);
  useEffect(() => {
    const print = printed.current !== printRequest;
    printed.current = printRequest;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        void fitView(FIT_OPTIONS);
        if (print) timeout = setTimeout(() => window.print(), PRINT_SETTLE_MS);
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [view, printRequest, fitView]);

  // Re-fit when cards are added (dropped or sent from the repository) so a new card never lands
  // outside the viewport and gets culled. Count only grows on add, so dragging and panning, which
  // leave the count unchanged, never trigger a refit.
  const fitted = useRef(nodes.length);
  useEffect(() => {
    if (nodes.length > fitted.current) void fitView(FIT_OPTIONS);
    fitted.current = nodes.length;
  }, [nodes.length, fitView]);

  const onNodesChange = (changes: NodeChange<ItemNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
    const picked = changes.find((change) => change.type === "select" && change.selected);
    if (picked?.type === "select") onSelect(picked.id);
    else if (changes.some((change) => change.type === "select")) onSelect(null);

    for (const change of changes) {
      if (change.type !== "position" || change.dragging !== false || !change.position) continue;
      unsaved.current.set(change.id, { id: change.id, ...change.position });
      clearTimeout(timer.current);
      timer.current = setTimeout(flush.current, SAVE_DELAY_MS);
    }
  };

  const onDragOver = (event: DragEvent) => {
    if (!canEdit || !event.dataTransfer.types.includes(CANVAS_ITEM_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };
  const onDrop = (event: DragEvent) => {
    const key = event.dataTransfer.getData(CANVAS_ITEM_MIME);
    if (!canEdit || !key) return;
    event.preventDefault();
    const { x, y } = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    onDropItem(key, { x: Math.round(x), y: Math.round(y) });
  };

  const [linkStart, setLinkStart] = useState<LinkStart | null>(null);
  const [picking, setPicking] = useState<LinkStart | null>(null);
  const [menu, setMenu] = useState<({ of: "node" | "edge"; key: string } & Point) | null>(null);
  const dimmed = unlinkableKeys(
    nodes.map((node) => node.id),
    linkStart ?? picking,
    props.canLink,
  );

  useEffect(() => {
    if (!picking) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPicking(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [picking]);

  const pick = (key: string) => {
    if (!picking) return;
    if (key === picking.key) {
      setPicking(null);
      return;
    }
    const [up, down] = linkEnds(picking, key);
    if (!props.canLink(up, down)) return;
    setPicking(null);
    props.onLink(up, down);
  };

  const openMenu =
    (of: "node" | "edge") =>
    (event: React.MouseEvent, { id }: { id: string }) => {
      event.preventDefault();
      setPicking(null);
      setMenu({ of, key: id, ...menuPoint(event) });
    };
  const itemOf = (key: string) => nodes.find((node) => node.id === key)?.data.item;
  const menuItem = menu?.of === "node" ? itemOf(menu.key) : undefined;
  const menuEdge = menu?.of === "edge" ? edges.find((edge) => edge.id === menu.key) : undefined;

  const { onToggleCollapse } = props;
  const context = useMemo(
    () => ({ canEdit, gaps, dimmed, collapsible, hiddenCount, onHide, onToggleCollapse }),
    [canEdit, gaps, dimmed, collapsible, hiddenCount, onHide, onToggleCollapse],
  );

  return (
    <BoardContext.Provider value={context}>
      <ReactFlow
        className={THEME}
        proOptions={{ hideAttribution: true }}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        isValidConnection={(connection) => props.canLink(connection.source, connection.target)}
        onConnect={(connection) => props.onLink(connection.source, connection.target)}
        onConnectStart={(_, { nodeId, handleType }) => {
          setPicking(null);
          setLinkStart(nodeId ? { key: nodeId, fromDownstream: handleType === "source" } : null);
        }}
        onConnectEnd={() => setLinkStart(null)}
        onNodeContextMenu={openMenu("node")}
        onEdgeContextMenu={canEdit ? openMenu("edge") : undefined}
        onNodeClick={(event, node) => {
          if (!(event.target as HTMLElement).closest("button")) pick(node.id);
        }}
        onPaneClick={() => setPicking(null)}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          const id = target.classList.contains("react-flow__node") ? target.dataset.id : undefined;
          if (event.key === "Enter" && id) pick(id);
        }}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        onlyRenderVisibleElements
        minZoom={0.1}
        fitView
        fitViewOptions={FIT_OPTIONS}
      >
        <Background />
        <ViewportPortal>
          {labels.map((label) => (
            <p
              key={label.key}
              data-testid="canvas-cluster-label"
              style={{ transform: `translate(${label.x}px, ${label.y}px)` }}
              className="pointer-events-none absolute max-w-[40rem] truncate text-sm font-semibold text-ink-muted"
            >
              {label.text}
            </p>
          ))}
        </ViewportPortal>
        <Toolbar items={items} canEdit={canEdit} onAutoLayout={props.onAutoLayout} />
        <Panel
          position="top-center"
          data-canvas-chrome
          className="flex flex-col items-center gap-1 print:hidden"
        >
          <div role="status">
            {picking ? (
              <p
                data-testid="canvas-picking"
                className="rounded-md border border-line bg-surface-raised px-3 py-1.5 text-sm text-ink shadow"
              >
                {M.picking}
              </p>
            ) : null}
            {focus ? (
              <p
                data-testid="canvas-focus"
                className="rounded-md border border-line bg-surface-raised px-3 py-1.5 text-sm text-ink shadow"
              >
                {M.focusing(itemOf(focus.key)?.Ref ?? focus.key)}
              </p>
            ) : null}
          </div>
          {focus ? (
            <div className="flex gap-1">
              {focus.depth !== Infinity ? (
                <Button
                  type="button"
                  variant="secondary"
                  data-testid="canvas-focus-trace"
                  onClick={() => focusOn({ key: focus.key, depth: Infinity })}
                >
                  {M.wholeTrace}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                data-testid="canvas-focus-clear"
                onClick={() => focusOn(null)}
              >
                {M.showAll}
              </Button>
            </div>
          ) : null}
        </Panel>
      </ReactFlow>
      {menu && menuItem ? (
        <NodeMenu
          key={`${menu.key}@${menu.x},${menu.y}`}
          item={menuItem}
          at={menu}
          canEdit={canEdit}
          onClose={() => setMenu(null)}
          onInspect={props.onInspect}
          onStartLink={(fromDownstream) => setPicking({ key: menu.key, fromDownstream })}
          onFocus={() => focusOn({ key: menu.key, depth: 1 })}
          onHide={onHide}
        />
      ) : null}
      {menu && menuEdge?.data?.link ? (
        <LinkMenu
          key={`${menu.key}@${menu.x},${menu.y}`}
          from={itemOf(menuEdge.source)?.Ref ?? menuEdge.source}
          to={itemOf(menuEdge.target)?.Ref ?? menuEdge.target}
          at={menu}
          onClose={() => setMenu(null)}
          onRemove={() => menuEdge.data?.link && props.onUnlink(menuEdge.data.link)}
        />
      ) : null}
    </BoardContext.Provider>
  );
}

export function CanvasBoard(props: BoardProps) {
  return (
    <ReactFlowProvider>
      <Board {...props} />
    </ReactFlowProvider>
  );
}
