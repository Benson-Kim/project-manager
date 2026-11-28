import type { Edge, Node } from "@xyflow/react";
import { dashFor, drawnStyle, type ConnectorStyle, type LineEnd } from "@/lib/connector-style";
import type { CanvasItem, CanvasLink } from "../schemas/canvas";
import { allowsLink, type LinkRule } from "../schemas/link-rules";
import { layoutClusters } from "./cluster-layout";
import { itemKey } from "./gaps";
import { NODE_HEIGHT, NODE_WIDTH, type Point } from "./layout";
import { defaultsFor, isPlainLook, lookOf, type LinkBranch } from "./link-layout";
import { canvasClusters, focusTrace, foldLinks, type Trace } from "./scale";

export type Placement = Pick<CanvasItem, "OnCanvas" | "X" | "Y" | "IsCollapsed">;
export type Placements = ReadonlyMap<string, Placement>;
export type ItemNode = Node<{ item: CanvasItem }, "item">;
export type ItemConnection = { up: CanvasItem; down: CanvasItem };
export type LinkEdge = Edge<{
  link?: CanvasLink;
  count: number;
  style?: ConnectorStyle;
  branch?: LinkBranch;
}>;

const keyOf = (item: CanvasItem) => itemKey(item.Kind, item.ItemId);

/** A drag from one item onto a requirement, when the rules allow the pair and the link is new. */
export function itemConnection(
  items: readonly CanvasItem[],
  links: readonly CanvasLink[],
  rules: readonly LinkRule[],
  sourceKey: string,
  targetKey: string,
): ItemConnection | null {
  if (sourceKey === targetKey) return null;
  const up = items.find((item) => keyOf(item) === sourceKey);
  const down = items.find((item) => keyOf(item) === targetKey);
  if (!up?.OnCanvas || !down?.OnCanvas || down.Type === "WBS") return null;
  if (!allowsLink(rules, down.Type, up.Type)) return null;
  const linked = links.some(
    (link) =>
      itemKey(link.UpstreamKind, link.UpstreamId) === sourceKey &&
      link.DownstreamId === down.ItemId,
  );
  return linked ? null : { up, down };
}

/** Where a link drag began. From the downstream handle the start is the upstream end. */
/** A new line that starts on an existing one: the line's downstream id and the spot (0-100, null = its label). */
export type BranchStart = { fromId: number; at: number | null };
export type LinkStart = { key: string; fromDownstream: boolean; branch?: BranchStart };

const NO_KEYS: ReadonlySet<string> = new Set();

/** The link from `start` to `key`, upstream end first. */
export function linkEnds(start: LinkStart, key: string): [string, string] {
  return start.fromDownstream ? [start.key, key] : [key, start.key];
}

/** Nodes the link being drawn cannot reach. The node it starts from stays lit. */
export function unlinkableKeys(
  keys: readonly string[],
  start: LinkStart | null,
  canLink: (sourceKey: string, targetKey: string) => boolean,
): ReadonlySet<string> {
  if (!start) return NO_KEYS;
  return new Set(keys.filter((key) => key !== start.key && !canLink(...linkEnds(start, key))));
}

/** The server's items with this viewer's unsaved or just-saved placements laid over them. */
export function applyPlacements(
  items: readonly CanvasItem[],
  placements: Placements,
): CanvasItem[] {
  return items.map((item) => {
    const placement = placements.get(keyOf(item));
    return placement ? { ...item, ...placement } : item;
  });
}

/** Takes back a refused write, leaving any node that a later write has already taken. */
export function rollbackPlacements(
  current: Placements,
  changes: Placements,
  before: Placements,
): Placements {
  const next = new Map(current);
  for (const [key, change] of changes) {
    if (next.get(key) !== change) continue;
    const old = before.get(key);
    if (old) next.set(key, old);
    else next.delete(key);
  }
  return next;
}

const samePlacement = (a: CanvasItem | undefined, b: CanvasItem | undefined) =>
  a !== undefined &&
  b !== undefined &&
  a.OnCanvas === b.OnCanvas &&
  a.X === b.X &&
  a.Y === b.Y &&
  a.IsCollapsed === b.IsCollapsed;

/**
 * Lets fresh server items win: a local placement stays only while the server still has that node
 * where it had it before, so a save from this window or another one replaces it. Nothing to drop
 * keeps the same map.
 */
export function settlePlacements(
  overlay: Placements,
  before: readonly CanvasItem[],
  after: readonly CanvasItem[],
): Placements {
  if (overlay.size === 0) return overlay;
  const byKey = (items: readonly CanvasItem[]) => new Map(items.map((item) => [keyOf(item), item]));
  const was = byKey(before),
    now = byKey(after);
  const stale = [...overlay.keys()].filter((key) => !samePlacement(was.get(key), now.get(key)));
  if (stale.length === 0) return overlay;
  const next = new Map(overlay);
  for (const key of stale) next.delete(key);
  return next;
}

/**
 * Items on the canvas. A saved position wins; the rest take their auto layout slot, laid out one
 * top-level WBS cluster at a time.
 */
export function boardNodes(
  items: readonly CanvasItem[],
  links: readonly CanvasLink[],
  selectedKey: string | null,
): ItemNode[] {
  const onCanvas = items.filter((item) => item.OnCanvas);
  const slots = layoutClusters(onCanvas, links, canvasClusters(items, links)).points;
  return onCanvas.map((item) => {
    const key = keyOf(item);
    const slot = slots.get(key);
    return {
      id: key,
      type: "item",
      position: { x: item.X ?? slot?.x ?? 0, y: item.Y ?? slot?.y ?? 0 },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      selected: key === selectedKey,
      data: { item },
    };
  });
}

const parentOf = (item: CanvasItem) =>
  item.ParentId === null ? null : itemKey(item.Kind, item.ParentId);

/** On-canvas items with an on-canvas item somewhere below them in their parent tree. */
export function collapsibleKeys(items: readonly CanvasItem[]): ReadonlySet<string> {
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const found = new Set<string>();
  for (const item of items) {
    if (!item.OnCanvas) continue;
    const seen = new Set([keyOf(item)]);
    for (let up = parentOf(item); up && !seen.has(up);) {
      seen.add(up);
      const parent = byKey.get(up);
      if (!parent) break;
      if (parent.OnCanvas) found.add(up);
      up = parentOf(parent);
    }
  }
  return found;
}

const MARKERS = { arrow: "arrowclosed", open: "arrow" } as const;

const markerFor = (end: LineEnd, colour: string | null) =>
  end === "arrow" || end === "open"
    ? { type: MARKERS[end], ...(colour ? { color: colour } : {}) }
    : undefined;

/** How a link someone styled or branched is drawn; null for a plain link, which keeps the usual look. */
function styledEdge(link: CanvasLink, source: string): Partial<LinkEdge> | null {
  const look = lookOf(link);
  if (isPlainLook(look)) return null;
  const drawn = drawnStyle(look.style, defaultsFor(link.LinkStatus === "Proposed"));
  return {
    markerStart: markerFor(drawn.startEnd, drawn.colour),
    markerEnd: markerFor(drawn.endEnd, drawn.colour),
    style: {
      strokeDasharray: dashFor(drawn.pattern, drawn.weight),
      strokeLinecap: drawn.pattern === "dotted" ? "round" : undefined,
      strokeWidth: drawn.weight ?? undefined,
      stroke: drawn.colour ?? undefined,
    },
    data: {
      link,
      count: 1,
      style: look.style,
      branch:
        look.branchFromId === null
          ? undefined
          : {
              fromEdge: `${source}>${itemKey("Requirement", look.branchFromId)}`,
              at: look.branchAt,
            },
    },
  };
}

/**
 * Links with both ends on the canvas, pointing downstream, one edge per shown pair. An edge that
 * stands for several links, or for a folded end, shows the count and carries no single link.
 * A link that is only Proposed is dashed, and a single link drawn its own way keeps that look. Under a focus, an edge none of whose links the trace
 * followed is hidden, even when both its cards are shown.
 */
export function boardEdges(
  items: readonly CanvasItem[],
  links: readonly CanvasLink[],
  hiddenBy: ReadonlyMap<string, string> = new Map(),
  traced: ReadonlySet<CanvasLink> | null = null,
): LinkEdge[] {
  const onCanvas = new Set(items.filter((item) => item.OnCanvas).map(keyOf));
  const shown = links.filter(
    (link) =>
      onCanvas.has(itemKey(link.UpstreamKind, link.UpstreamId)) &&
      onCanvas.has(itemKey("Requirement", link.DownstreamId)),
  );
  return foldLinks(shown, hiddenBy).map(({ source, target, links: folded }) => {
    const single = folded.length === 1 ? folded[0] : undefined;
    const own =
      single &&
      !hiddenBy.has(itemKey(single.UpstreamKind, single.UpstreamId)) &&
      !hiddenBy.has(itemKey("Requirement", single.DownstreamId))
        ? single
        : undefined;
    return {
      id: `${source}>${target}`,
      type: "routed",
      source,
      target,
      sourceHandle: "downstream",
      targetHandle: "upstream",
      markerEnd: { type: "arrowclosed" as const },
      hidden: traced !== null && !folded.some((link) => traced.has(link)),
      data: own ? { link: own, count: 1 } : { count: folded.length },
      ...(own ? {} : { label: String(folded.length) }),
      ...(folded.every((link) => link.LinkStatus === "Proposed")
        ? { style: { strokeDasharray: "6 4" } }
        : {}),
      ...(own ? styledEdge(own, source) : null),
    };
  });
}

/** A card shown with what lies up to `depth` links from it. */
export type Focus = { key: string; depth: number };

/** Keys of items currently placed on the canvas. */
export function onCanvasKeySet(items: readonly CanvasItem[]): Set<string> {
  return new Set(items.filter((item) => item.OnCanvas).map(keyOf));
}

/** Keys present in `current` that were absent from `previous`. */
export function newlyPlacedKeys(
  previous: ReadonlySet<string>,
  current: ReadonlySet<string>,
): string[] {
  const added: string[] = [];
  for (const key of current) {
    if (!previous.has(key)) added.push(key);
  }
  return added;
}

/** Keys kept visible during a focus: the trace keys plus any cards placed while that focus is open
 * (mapped to a collapsed ancestor if folded). Returns null when focus is off.
 */
export function focusVisibleKeys(
  focusedKeys: ReadonlySet<string> | null,
  pinnedKeys: ReadonlySet<string>,
  hiddenBy: ReadonlyMap<string, string> = new Map(),
): ReadonlySet<string> | null {
  if (focusedKeys === null) return null;
  if (pinnedKeys.size === 0) return focusedKeys;
  const visible = new Set(focusedKeys);
  for (const key of pinnedKeys) visible.add(hiddenBy.get(key) ?? key);
  return visible;
}

export interface NodeBox {
  position: { x: number; y: number };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
  hidden?: boolean;
}

/** Resolves finite positive card dimensions, falling back to default canvas card size. */
export function resolvedNodeSize(node: Pick<NodeBox, "width" | "height" | "measured">): {
  width: number;
  height: number;
} {
  const pick = (primary: number | undefined, secondary: number | undefined, fallback: number) =>
    typeof primary === "number" && Number.isFinite(primary) && primary > 0
      ? primary
      : typeof secondary === "number" && Number.isFinite(secondary) && secondary > 0
        ? secondary
        : fallback;
  return {
    width: pick(node.measured?.width, node.width, NODE_WIDTH),
    height: pick(node.measured?.height, node.height, NODE_HEIGHT),
  };
}

/**
 * What a focus leaves on the board: its traced nodes, a folded one showing as the card that folds
 * it, and the links the trace followed.
 */
export function focusView(
  focus: Focus | null,
  links: readonly CanvasLink[],
  hiddenBy: ReadonlyMap<string, string>,
): Trace | null {
  if (!focus) return null;
  const trace = focusTrace(focus.key, links, focus.depth);
  return {
    keys: new Set([...trace.keys].map((key) => hiddenBy.get(key) ?? key)),
    links: trace.links,
  };
}

/** Nodes a fold or a focus takes off the board. Their positions stay, so they come back in place. */
export function withHidden(
  nodes: readonly ItemNode[],
  hiddenBy: ReadonlyMap<string, string>,
  shown: ReadonlySet<string> | null,
): ItemNode[] {
  return nodes.map((node) => ({
    ...node,
    hidden: hiddenBy.has(node.id) || (shown !== null && !shown.has(node.id)),
  }));
}

export type ClusterLabel = { key: string; text: string; x: number; y: number };

export const CLUSTER_LABEL_RISE = 32;

/** One label per WBS cluster, just above the top-left of its shown cards. */
export function clusterLabels(
  items: readonly CanvasItem[],
  nodes: readonly ItemNode[],
  clusters: ReadonlyMap<string, string | null>,
): ClusterLabel[] {
  const corners = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const cluster = clusters.get(node.id);
    if (node.hidden || !cluster) continue;
    const corner = corners.get(cluster);
    corners.set(cluster, {
      x: Math.min(corner?.x ?? Infinity, node.position.x),
      y: Math.min(corner?.y ?? Infinity, node.position.y),
    });
  }
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  return [...corners].flatMap(([key, { x, y }]) => {
    const root = byKey.get(key);
    return root ? [{ key, text: `${root.Ref} ${root.Title}`, x, y: y - CLUSTER_LABEL_RISE }] : [];
  });
}

/**
 * New data over the flow's own nodes: keeps what it measured, and a node mid-drag, or dropped but
 * not saved yet (`unsaved`), where it is.
 */
export function mergeFlowNodes(
  next: readonly ItemNode[],
  current: readonly ItemNode[],
  unsaved: ReadonlySet<string> = NO_KEYS,
): ItemNode[] {
  const flow = new Map(current.map((node) => [node.id, node]));
  return next.map((node) => {
    const old = flow.get(node.id);
    if (!old) return node;
    const position = old.dragging || unsaved.has(node.id) ? old.position : node.position;
    return { ...node, position, measured: old.measured, dragging: old.dragging };
  });
}

const ECHO_SLACK = 1;

const samePlace = (a: Point, b: Point) =>
  Math.abs(a.x - b.x) < ECHO_SLACK && Math.abs(a.y - b.y) < ECHO_SLACK;

/**
 * The places a merge gave cards the board itself moved. The flow reports each of those back as a
 * position change, which must not be collected as a move the user made.
 */
export function echoedPlaces(
  before: readonly ItemNode[],
  after: readonly ItemNode[],
): Map<string, Point> {
  const was = new Map(before.map((node) => [node.id, node.position]));
  const echoes = new Map<string, Point>();
  for (const node of after) {
    const at = was.get(node.id);
    if (!at || !samePlace(at, node.position)) echoes.set(node.id, { ...node.position });
  }
  return echoes;
}

/** Whether a position change only reports back a place the board set; takes that echo as read. */
export function takeEcho(echoes: Map<string, Point>, id: string, at: Point): boolean {
  const echo = echoes.get(id);
  if (!echo || !samePlace(echo, at)) return false;
  echoes.delete(id);
  return true;
}

/**
 * Where the shown cards with no saved place sit now, and whether the layout moved one that was
 * already on the board. A new link regroups those cards; cards placed by hand stay where they are.
 */
export function layoutMoves(
  before: ReadonlyMap<string, string>,
  nodes: readonly ItemNode[],
): { laidOut: Map<string, string>; moved: boolean } {
  const laidOut = new Map(
    nodes
      .filter((node) => !node.hidden && (node.data.item.X === null || node.data.item.Y === null))
      .map((node) => [node.id, `${node.position.x},${node.position.y}`]),
  );
  const moved = [...laidOut].some(([id, at]) => before.has(id) && before.get(id) !== at);
  return { laidOut, moved };
}

/** Whole-number moves that changed anything, as the move action takes them. */
export function savedMoves(
  moves: readonly { id: string; x: number; y: number }[],
  items: readonly CanvasItem[],
) {
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  return moves.flatMap(({ id, x, y }) => {
    const item = byKey.get(id);
    if (!item?.OnCanvas) return [];
    const rounded = { x: Math.round(x), y: Math.round(y) };
    if (item.X === rounded.x && item.Y === rounded.y) return [];
    return [
      {
        kind: item.Kind,
        itemId: item.ItemId,
        ...rounded,
        isCollapsed: item.IsCollapsed,
      },
    ];
  });
}
