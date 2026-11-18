import {
  anchorOn,
  crossings,
  labelPoint,
  lineBetween,
  linePath,
  pointAt,
  routeBetween,
  type Line,
  type Point,
  type Rect,
  type Side,
} from "@/lib/connector-route";
import {
  drawnStyle,
  isPlain,
  PLAIN_STYLE,
  type ConnectorStyle,
  type StyleDefaults,
} from "@/lib/connector-style";
import type { CanvasLink } from "../schemas/canvas";

export const STANDOFF = 12;

/** A link's look on one canvas, and the line it branches off, if any. */
export type LinkLook = {
  style: ConnectorStyle;
  branchFromId: number | null;
  branchAt: number | null;
};

/** Where a branch starts: on the parent edge's line, at a share of its length, or at its label. */
export type LinkBranch = { fromEdge: string; at: number | null };
export type LaidEdge = {
  id: string;
  source: string;
  target: string;
  style: ConnectorStyle | null;
  branch: LinkBranch | null;
};
export type EdgeGeometry = { points: Point[]; path: string; label: Point };

export const defaultsFor = (proposed: boolean): StyleDefaults => ({
  shape: "angled",
  pattern: proposed ? "dashed" : "solid",
  startEnd: "none",
  endEnd: "arrow",
  sourceSide: "right",
  targetSide: "left",
});

export const lookOf = (link: CanvasLink): LinkLook => ({
  style: {
    shape: link.LineShape ?? null,
    pattern: link.LinePattern ?? null,
    startEnd: link.StartEnd ?? null,
    endEnd: link.EndEnd ?? null,
    weight: link.LineWeight ?? null,
    colour: link.LineColour ?? null,
    attach: link.Attach ?? null,
    sourceSide: link.SourceSide ?? null,
    targetSide: link.TargetSide ?? null,
    jumps: link.Jumps ?? null,
  },
  branchFromId: link.BranchFromId ?? null,
  branchAt: link.BranchAt ?? null,
});

export const withLook = (link: CanvasLink, { style, branchFromId, branchAt }: LinkLook) => ({
  ...link,
  LineShape: style.shape,
  LinePattern: style.pattern,
  StartEnd: style.startEnd,
  EndEnd: style.endEnd,
  LineWeight: style.weight,
  LineColour: style.colour,
  Attach: style.attach,
  SourceSide: style.sourceSide,
  TargetSide: style.targetSide,
  Jumps: style.jumps,
  BranchFromId: branchFromId,
  BranchAt: branchAt,
});

const sameText = (a: unknown, b: unknown) =>
  String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

/** True when a link read back from the server already shows this look. */
export const carriesLook = (link: CanvasLink, look: LinkLook) => {
  const saved = lookOf(link);
  return (
    sameText(saved.branchFromId, look.branchFromId) &&
    sameText(saved.branchAt, look.branchAt) &&
    (Object.keys(saved.style) as (keyof ConnectorStyle)[]).every((field) =>
      sameText(saved.style[field], look.style[field]),
    )
  );
};

export const isPlainLook = (look: LinkLook) => isPlain(look.style) && look.branchFromId === null;

const towards = (from: Point, to: Point): Side => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
};

const labelOf = (line: Line, shape: string) =>
  shape === "angled" ? labelPoint(line.points) : pointAt(line.points, 0.5);

/** A plain line's points, as drawn with today's look, to find a spot on it. */
export const plainPoints = (
  edge: Pick<LaidEdge, "id" | "source" | "target">,
  rects: ReadonlyMap<string, Rect>,
) =>
  layoutLinks([{ ...edge, style: { ...PLAIN_STYLE, shape: "angled" }, branch: null }], rects).get(
    edge.id,
  )?.points;

/**
 * The drawn line of every edge someone styled or branched, from the cards' boxes, so a line stays
 * on its cards when they move. Plain edges are left out and keep their usual path; they are still
 * laid out so a line with jumps hops over them.
 */
export function layoutLinks(
  edges: readonly LaidEdge[],
  rects: ReadonlyMap<string, Rect>,
): Map<string, EdgeGeometry> {
  const lines = new Map<string, { line: Line; shape: string; jumps: boolean }>();
  const lay = (edge: LaidEdge, parent?: Line) => {
    const source = rects.get(edge.source);
    const target = rects.get(edge.target);
    if (!source || !target) return;
    const drawn = drawnStyle(edge.style ?? PLAIN_STYLE, defaultsFor(false));
    const route =
      drawn.attach === "floating"
        ? (routeBetween(source, target) ?? drawn)
        : { sourceSide: drawn.sourceSide, targetSide: drawn.targetSide };
    const to = anchorOn(target, route.targetSide);
    const start =
      parent &&
      (edge.branch?.at == null
        ? labelPoint(parent.points)
        : pointAt(parent.points, edge.branch.at / 100));
    const line = start
      ? lineBetween(start, towards(start, to), to, route.targetSide, drawn.shape, 0)
      : lineBetween(
          anchorOn(source, route.sourceSide),
          route.sourceSide,
          to,
          route.targetSide,
          drawn.shape,
          STANDOFF,
        );
    lines.set(edge.id, { line, shape: drawn.shape, jumps: drawn.jumps });
  };
  for (const edge of edges) if (!edge.branch) lay(edge);
  for (const edge of edges) if (edge.branch) lay(edge, lines.get(edge.branch.fromEdge)?.line);

  const out = new Map<string, EdgeGeometry>();
  const before: Line[] = [];
  for (const edge of edges) {
    const laid = lines.get(edge.id);
    if (!laid) continue;
    if (edge.branch || (edge.style && !isPlain(edge.style))) {
      const hops = laid.jumps ? crossings(laid.line, before) : [];
      out.set(edge.id, {
        points: laid.line.points,
        path: linePath(laid.line, hops),
        label: labelOf(laid.line, laid.shape),
      });
    }
    before.push(laid.line);
  }
  return out;
}
