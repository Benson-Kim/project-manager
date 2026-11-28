"use client";

import {
  applyNodeChanges,
  Background,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  useViewport,
  ViewportPortal,
  type NodeChange,
  type ReactFlowState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ContextMenu, menuPoint } from "@/components/ui/context-menu";
import { MenuButton } from "@/components/ui/menu";
import { isEditableTarget } from "@/components/ui/data-view/datasheet";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import {
  boardEdges,
  boardNodes,
  clusterLabels,
  collapsibleKeys,
  focusView,
  focusVisibleKeys,
  layoutMoves,
  linkEnds,
  echoedPlaces,
  mergeFlowNodes,
  takeEcho,
  newlyPlacedKeys,
  onCanvasKeySet,
  unlinkableKeys,
  withHidden,
  type Focus,
  type BranchStart,
  type LinkEdge,
  type LinkStart,
  type ItemNode,
} from "../../canvas/board-model";
import { plainPoints, type LinkLook } from "../../canvas/link-layout";
import { nearestAt, type Rect } from "@/lib/connector-route";
import { LinkMenu } from "./link-menu";
import { LinkStylePanel } from "./link-style-panel";
import type { CanvasGaps } from "../../canvas/gaps";
import { canvasClusters, collapsedView } from "../../canvas/scale";
import type { Point } from "../../canvas/layout";
import {
  capMoves,
  hasOverlaps,
  separateOverlaps,
  separationMoves,
} from "../../canvas/separate-overlaps";
import { shouldShowBackToContent } from "../../canvas/viewport-visibility";
import { CANVAS_MOVE_MAX, type CanvasItem, type CanvasLink } from "../../schemas/canvas";
import { BoardContext, ItemNodeView } from "./item-node";
import { NodeMenu } from "./node-menu";
import { RoutedEdge } from "./routed-edge";
import { LinkLayoutContext, useLinkLayout } from "./use-link-layout";

const M = messages.requirements.canvas;

export const CANVAS_ITEM_MIME = "application/x-canvas-item";

const nodeTypes = { item: ItemNodeView };
const edgeTypes = { routed: RoutedEdge };
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
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  canLink: (sourceKey: string, targetKey: string) => boolean;
  onLink: (sourceKey: string, targetKey: string) => void;
  onUnlink: (link: CanvasLink) => void;
  onStyle: (link: CanvasLink, look: LinkLook) => void;
  onBranch: (sourceKey: string, targetKey: string, branch: BranchStart) => void;
  onInspect: (requirementId: number) => void;
  onToggleCollapse: (item: CanvasItem) => void;
}

/**
 * Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z (Cmd on a Mac) belong to the field being typed in; anywhere else
 * on the board they are Undo and Redo.
 */
function historyKey(event: React.KeyboardEvent): "undo" | "redo" | null {
  const target = event.target as HTMLElement;
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  if (isEditableTarget(target) && target.tagName !== "BUTTON") return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  return key === "y" && !event.shiftKey ? "redo" : null;
}

/** Escape leaves a focus unless a field, a menu or a dialog has it. */
function leavesFocus(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.defaultPrevented) return false;
  const target = event.target as HTMLElement;
  if (isEditableTarget(target) && target.tagName !== "BUTTON") return false;
  return !target.closest?.('[role="dialog"], [role="alertdialog"], [role="menu"]');
}

function Toolbar({
  items,
  canEdit,
  canSeparate,
  onSeparateOverlaps,
  onAutoLayout,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  focus,
  onFocus,
}: Pick<
  BoardProps,
  "items" | "canEdit" | "onAutoLayout" | "onUndo" | "canUndo" | "onRedo" | "canRedo"
> & {
  canSeparate: boolean;
  onSeparateOverlaps: () => void;
  focus: Focus | null;
  onFocus: (next: Focus | null) => void;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const [confirming, setConfirming] = useState(false);
  const handPlaced = items.some((item) => item.OnCanvas && item.X !== null);

  return (
    <Panel
      position="top-right"
      data-canvas-chrome
      className="flex flex-wrap items-center justify-end gap-1 print:hidden"
    >
      {focus ? (
        <>
          {focus.depth !== Infinity ? (
            <Button
              type="button"
              variant="secondary"
              data-testid="canvas-focus-trace"
              onClick={() => onFocus({ key: focus.key, depth: Infinity })}
            >
              {M.wholeTrace}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            data-testid="canvas-focus-clear"
            aria-keyshortcuts="Escape"
            onClick={() => onFocus(null)}
          >
            {M.showAll}
          </Button>
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
        </>
      ) : null}
      {canEdit ? (
        <>
          <Button
            type="button"
            variant="secondary"
            data-testid="canvas-undo"
            aria-keyshortcuts="Control+Z"
            disabled={!canUndo}
            onClick={onUndo}
          >
            {M.undo}
          </Button>
          <Button
            type="button"
            variant="secondary"
            data-testid="canvas-redo"
            aria-keyshortcuts="Control+Y Control+Shift+Z"
            disabled={!canRedo}
            onClick={onRedo}
          >
            {M.redo}
          </Button>
          <Button
            type="button"
            variant="secondary"
            data-testid="canvas-separate-overlaps"
            disabled={!canSeparate}
            onClick={onSeparateOverlaps}
          >
            {M.separateOverlaps}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => (handPlaced ? setConfirming(true) : onAutoLayout())}
          >
            {M.autoLayout}
          </Button>
        </>
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

/**
 * Isolated viewport subscriber so panning/zooming never re-renders `<Board>`, and computes
 * visibility in ReactFlow coordinates because `onlyRenderVisibleElements` culls off-screen DOM.
 */
function BackToContent({ nodes }: { nodes: readonly ItemNode[] }) {
  const { fitView } = useReactFlow();
  const viewport = useViewport();
  const width = useStore((state: ReactFlowState) => state.width);
  const height = useStore((state: ReactFlowState) => state.height);
  if (!shouldShowBackToContent(nodes, viewport, { width, height })) return null;

  return (
    <Panel position="bottom-right" data-canvas-chrome className="print:hidden">
      <Button
        type="button"
        variant="secondary"
        data-testid="canvas-back-to-content"
        onClick={() => void fitView(FIT_OPTIONS)}
      >
        {M.backToContent}
      </Button>
    </Panel>
  );
}

type MenuState = ({ of: "node" | "edge"; key: string } & Point) | ({ of: "pane" } & Point);

function Board(props: BoardProps) {
  const { items, links, gaps, canEdit, selectedKey, onSelect, onHide, onDropItem } = props;
  const { screenToFlowPosition, fitView, getInternalNode } = useReactFlow();
  const { hiddenBy, hiddenCount } = useMemo(() => collapsedView(items), [items]);
  const collapsible = useMemo(() => collapsibleKeys(items), [items]);
  const [focus, setFocus] = useState<Focus | null>(null);
  const onCanvasKeys = useMemo(() => onCanvasKeySet(items), [items]);
  const [seenOnCanvas, setSeenOnCanvas] = useState<ReadonlySet<string>>(onCanvasKeys);
  const [pinnedKeys, setPinnedKeys] = useState<ReadonlySet<string>>(new Set());
  if (seenOnCanvas !== onCanvasKeys) {
    setSeenOnCanvas(onCanvasKeys);
    if (focus !== null) {
      const added = newlyPlacedKeys(seenOnCanvas, onCanvasKeys);
      const pruned = [...pinnedKeys].filter((key) => onCanvasKeys.has(key));
      if (added.length > 0 || pruned.length !== pinnedKeys.size) {
        setPinnedKeys(new Set([...pruned, ...added]));
      }
    } else if (pinnedKeys.size > 0) {
      setPinnedKeys(new Set());
    }
  }
  const focused = useMemo(() => focusView(focus, links, hiddenBy), [focus, links, hiddenBy]);
  const visibleFocused = useMemo(
    () => focusVisibleKeys(focused?.keys ?? null, pinnedKeys, hiddenBy),
    [focused, pinnedKeys, hiddenBy],
  );
  const wanted = useMemo(
    () => withHidden(boardNodes(items, links, selectedKey), hiddenBy, visibleFocused),
    [items, links, selectedKey, hiddenBy, visibleFocused],
  );
  const focusOn = useCallback(
    (next: Focus | null) => {
      setFocus(next);
      if (!next) setPinnedKeys(new Set());
      void fitView({ ...FIT_OPTIONS, duration: 200 });
    },
    [fitView],
  );
  const edges = useMemo(
    () => boardEdges(items, links, hiddenBy, focused?.links ?? null),
    [items, links, hiddenBy, focused],
  );
  const linkLayout = useLinkLayout(edges);
  const unsaved = useRef(new Map<string, { id: string } & Point>());
  // The board's own scratch record, not rendered: a Map held in state so that writing it while
  // deriving `nodes` from `wanted` is not a ref access during render. The first cards are placed
  // by the board too, so the flow reporting those places back is no more a move than a merge is.
  const [echoes] = useState(() => echoedPlaces([], wanted));
  const [nodes, setNodes] = useState(wanted);
  const [seen, setSeen] = useState(wanted);
  const [moved, setMoved] = useState<ReadonlySet<string>>(new Set());
  /** Keeps the places the board set itself, so the flow reporting them back is not a new move. */
  const place = (merged: ItemNode[], from: readonly ItemNode[]) => {
    for (const [id, at] of echoedPlaces(from, merged)) echoes.set(id, at);
    setNodes(merged);
  };
  if (seen !== wanted) {
    setSeen(wanted);
    place(mergeFlowNodes(wanted, nodes, moved), nodes);
  }
  const clusters = useMemo(() => canvasClusters(items, links), [items, links]);
  const labels = useMemo(() => clusterLabels(items, nodes, clusters), [items, nodes, clusters]);

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
    setMoved(new Set());
  });
  useEffect(() => flush.current, []);
  /** Forgets a drop that is not saved yet; true when there was one. */
  const dropUnsaved = () => {
    clearTimeout(timer.current);
    const pending = unsaved.current.size > 0;
    unsaved.current = new Map();
    setMoved(new Set());
    return pending;
  };
  /** A drop not saved yet is the newest change, so Undo puts that card back before anything else. */
  const undo = () => {
    if (dropUnsaved()) place(mergeFlowNodes(wanted, nodes), nodes);
    else props.onUndo();
  };
  /** A drop not saved yet is a new change, which leaves Redo nothing to make again. */
  const redo = () => {
    if (unsaved.current.size > 0) flush.current();
    else props.onRedo();
  };

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

  // A new link regroups the cards that have no saved place, which can move one out of view.
  const laidOut = useRef(new Map<string, string>());
  useEffect(() => {
    const next = layoutMoves(laidOut.current, wanted);
    laidOut.current = next.laidOut;
    if (next.moved) void fitView(FIT_OPTIONS);
  }, [wanted, fitView]);

  const onNodesChange = (changes: NodeChange<ItemNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
    const picked = changes.find((change) => change.type === "select" && change.selected);
    if (picked?.type === "select") onSelect(picked.id);
    else if (changes.some((change) => change.type === "select")) onSelect(null);

    for (const change of changes) {
      if (change.type !== "position" || change.dragging !== false || !change.position) continue;
      if (takeEcho(echoes, change.id, change.position)) continue;
      unsaved.current.set(change.id, { id: change.id, ...change.position });
      setMoved((ids) => new Set(ids).add(change.id));
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
  const [menu, setMenu] = useState<MenuState | null>(null);
  const dimmed = unlinkableKeys(
    nodes.map((node) => node.id),
    linkStart ?? picking,
    props.canLink,
  );
  const overlapping = useMemo(() => hasOverlaps(nodes), [nodes]);
  const { toast } = useToast();
  const separate = () => {
    if (!canEdit) return;
    const merged = new Map(unsaved.current);
    const moves = separationMoves(nodes, separateOverlaps(nodes));
    for (const move of moves) merged.set(move.id, move);
    dropUnsaved();
    const { batch, capped } = capMoves([...merged.values()], CANVAS_MOVE_MAX);
    if (batch.length > 0) props.onMove(batch);
    if (capped) {
      toast({ variant: "info", title: M.separateCapped(CANVAS_MOVE_MAX) });
    }
  };

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

  const inFocus = focus !== null;
  useEffect(() => {
    if (!inFocus || picking) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!leavesFocus(event)) return;
      event.preventDefault();
      focusOn(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [inFocus, picking, focusOn]);

  const pick = (key: string) => {
    if (!picking) return;
    if (key === picking.key) {
      setPicking(null);
      return;
    }
    const [up, down] = linkEnds(picking, key);
    if (!props.canLink(up, down)) return;
    setPicking(null);
    if (picking.branch) props.onBranch(up, down, picking.branch);
    else props.onLink(up, down);
  };

  const rectOf = (key: string): Rect | undefined => {
    const node = getInternalNode(key);
    return node
      ? {
          ...node.internals.positionAbsolute,
          width: node.measured.width ?? 0,
          height: node.measured.height ?? 0,
        }
      : undefined;
  };
  const spotOn = (edge: LinkEdge, at: Point) => {
    const rects = new Map<string, Rect>();
    for (const key of [edge.source, edge.target]) {
      const rect = rectOf(key);
      if (rect) rects.set(key, rect);
    }
    const points = linkLayout.get(edge.id)?.points ?? plainPoints(edge, rects);
    return points ? Math.round(nearestAt(points, screenToFlowPosition(at)) * 100) : null;
  };
  const [styling, setStyling] = useState<string | null>(null);
  const styledLink = styling ? edges.find((edge) => edge.id === styling)?.data?.link : undefined;

  const openMenu =
    (of: "node" | "edge") =>
    (event: React.MouseEvent, { id }: { id: string }) => {
      event.preventDefault();
      setPicking(null);
      setMenu({ of, key: id, ...menuPoint(event) });
    };
  const openPaneMenu = (event: React.MouseEvent | MouseEvent) => {
    if (!focus) return;
    event.preventDefault();
    setPicking(null);
    setMenu({ of: "pane", ...menuPoint(event) });
  };
  const itemOf = (key: string) => nodes.find((node) => node.id === key)?.data.item;
  const menuItem = menu?.of === "node" ? itemOf(menu.key) : undefined;
  const menuEdge = menu?.of === "edge" ? edges.find((edge) => edge.id === menu.key) : undefined;
  const menuLink = menuEdge?.data?.link;

  const { onToggleCollapse } = props;
  const context = useMemo(
    () => ({ canEdit, gaps, dimmed, collapsible, hiddenCount, onHide, onToggleCollapse }),
    [canEdit, gaps, dimmed, collapsible, hiddenCount, onHide, onToggleCollapse],
  );

  return (
    <BoardContext.Provider value={context}>
      <LinkLayoutContext.Provider value={linkLayout}>
        <ReactFlow
          className={THEME}
          proOptions={{ hideAttribution: true }}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
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
          onPaneContextMenu={focus ? openPaneMenu : undefined}
          onNodeClick={(event, node) => {
            if (!(event.target as HTMLElement).closest("button")) pick(node.id);
          }}
          onPaneClick={() => setPicking(null)}
          onKeyDown={(event) => {
            const shortcut = historyKey(event);
            if (shortcut) {
              event.preventDefault();
              if (shortcut === "undo") undo();
              else redo();
              return;
            }
            const target = event.target as HTMLElement;
            const id = target.classList.contains("react-flow__node")
              ? target.dataset.id
              : undefined;
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
          <Toolbar
            items={items}
            canEdit={canEdit}
            canSeparate={overlapping}
            onSeparateOverlaps={separate}
            onAutoLayout={() => {
              dropUnsaved();
              props.onAutoLayout();
            }}
            onUndo={undo}
            canUndo={props.canUndo}
            onRedo={redo}
            canRedo={props.canRedo}
            focus={focus}
            onFocus={focusOn}
          />
          <BackToContent nodes={nodes} />
          <Panel position="bottom-center" data-canvas-chrome className="print:hidden">
            <div role="status">
              {picking ? (
                <p
                  data-testid="canvas-picking"
                  className="rounded-md border border-line bg-surface-raised px-3 py-1.5 text-sm text-ink shadow"
                >
                  {picking.branch ? M.branching : M.picking}
                </p>
              ) : null}
              {focus ? (
                <p data-testid="canvas-focus" className="sr-only">
                  {M.focusing(itemOf(focus.key)?.Ref ?? focus.key)}
                </p>
              ) : null}
            </div>
          </Panel>
          {styledLink ? (
            <LinkStylePanel
              link={styledLink}
              onStyle={(look) => props.onStyle(styledLink, look)}
              onClose={() => setStyling(null)}
            />
          ) : null}
        </ReactFlow>
        {menu?.of === "node" && menuItem ? (
          <NodeMenu
            key={`${menu.key}@${menu.x},${menu.y}`}
            item={menuItem}
            at={menu}
            canEdit={canEdit}
            onClose={() => setMenu(null)}
            onInspect={props.onInspect}
            onStartLink={(fromDownstream) => setPicking({ key: menu.key, fromDownstream })}
            onFocus={() => focusOn({ key: menu.key, depth: 1 })}
            onShowAll={focus ? () => focusOn(null) : undefined}
            onHide={onHide}
          />
        ) : null}
        {menu?.of === "edge" && menuEdge && menuLink ? (
          <LinkMenu
            key={`${menu.key}@${menu.x},${menu.y}`}
            from={itemOf(menuEdge.source)?.Ref ?? menuEdge.source}
            to={itemOf(menuEdge.target)?.Ref ?? menuEdge.target}
            at={menu}
            onClose={() => setMenu(null)}
            onRemove={() => props.onUnlink(menuLink)}
            onStyle={() => setStyling(menuEdge.id)}
            onBranch={
              menuEdge.data?.branch
                ? undefined
                : (fromLabel) =>
                    setPicking({
                      key: menuEdge.source,
                      fromDownstream: true,
                      branch: {
                        fromId: menuLink.DownstreamId,
                        at: fromLabel ? null : spotOn(menuEdge, menu),
                      },
                    })
            }
          />
        ) : null}
        {menu?.of === "pane" && focus ? (
          <ContextMenu
            key={`pane@${menu.x},${menu.y}`}
            at={menu}
            label={M.paneMenu}
            onClose={() => setMenu(null)}
          >
            <MenuButton testId="canvas-menu-show-all-links" onClick={() => focusOn(null)}>
              {M.showAllLinks}
            </MenuButton>
          </ContextMenu>
        ) : null}
      </LinkLayoutContext.Provider>
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
