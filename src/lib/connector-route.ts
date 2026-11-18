/**
 * Connector routing and drawing shared by every diagram that draws lines between boxes: straight,
 * right-angle or curved lines, line jumps where lines cross, and points along a line.
 */
export type Side = "top" | "right" | "bottom" | "left";
export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };
export type Route = { sourceSide: Side; targetSide: Side };

const ALIGNED = 0.5;

export const facing: Record<Side, Side> = {
  left: "right",
  right: "left",
  top: "bottom",
  bottom: "top",
};
const flipSide: Record<Side, Side> = { left: "top", top: "left", right: "bottom", bottom: "right" };

export const isLevel = (side: Side) => side === "left" || side === "right";
const forward = (side: Side) => (side === "right" || side === "bottom" ? 1 : -1);
const flip = (p: Point): Point => ({ x: p.y, y: p.x });

export const centreOf = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

const horizontal = (dx: number): Side => (dx >= 0 ? "right" : "left");
const vertical = (dy: number): Side => (dy >= 0 ? "bottom" : "top");
const outsideY = (y: number, r: Rect) => y < r.y || y > r.y + r.height;
const outsideX = (x: number, r: Rect) => x < r.x || x > r.x + r.width;
const overlapY = (a: Rect, b: Rect) => a.y < b.y + b.height && b.y < a.y + a.height;
const overlapX = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width;

export const sameRoute = (a: Route, b: Route) =>
  a.sourceSide === b.sourceSide && a.targetSide === b.targetSide;

/**
 * The sides that join two boxes with one straight line when their centres line up, otherwise with a
 * single right angle that clears both boxes. Keeps `current` when it is already such a route. Null
 * when the boxes overlap both ways.
 */
export function routeBetween(source: Rect, target: Rect, current?: Route): Route | null {
  const a = centreOf(source);
  const b = centreOf(target);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const across = (side: Side): Route => ({ sourceSide: side, targetSide: facing[side] });

  if (Math.abs(dy) <= ALIGNED && !overlapX(source, target)) return across(horizontal(dx));
  if (Math.abs(dx) <= ALIGNED && !overlapY(source, target)) return across(vertical(dy));

  const routes: Route[] = [];
  const thenDown: Route = { sourceSide: horizontal(dx), targetSide: facing[vertical(dy)] };
  const thenAcross: Route = { sourceSide: vertical(dy), targetSide: facing[horizontal(dx)] };
  const downFits = outsideY(a.y, target) && outsideX(b.x, source);
  const acrossFits = outsideX(a.x, target) && outsideY(b.y, source);
  const preferAcross = Math.abs(dx) >= Math.abs(dy);
  if (acrossFits && preferAcross) routes.push(thenAcross);
  if (downFits) routes.push(thenDown);
  if (acrossFits && !preferAcross) routes.push(thenAcross);
  if (routes.length > 0)
    return routes.find((route) => current && sameRoute(route, current)) ?? routes[0]!;

  if (!overlapX(source, target)) return across(horizontal(dx));
  if (!overlapY(source, target)) return across(vertical(dy));
  return null;
}

/**
 * The corners of a line that leaves `from` through `fromSide` and enters `to` through `toSide`.
 * `standoff` is how far the line runs clear of a box before it turns back.
 */
export function orthogonalPoints(
  from: Point,
  fromSide: Side,
  to: Point,
  toSide: Side,
  standoff = 0,
): Point[] {
  if (!isLevel(fromSide)) {
    return orthogonalPoints(
      flip(from),
      flipSide[fromSide],
      flip(to),
      flipSide[toSide],
      standoff,
    ).map(flip);
  }
  const dir = forward(fromSide);
  const ahead = (to.x - from.x) * dir;
  const out = from.x + dir * standoff;

  if (!isLevel(toSide)) {
    const down = forward(facing[toSide]);
    if (ahead >= 0 && (to.y - from.y) * down >= 0) return [from, { x: to.x, y: from.y }, to];
    const into = to.y - down * standoff;
    return [from, { x: out, y: from.y }, { x: out, y: into }, { x: to.x, y: into }, to];
  }

  if (toSide === fromSide) {
    const edge = dir > 0 ? Math.max(from.x, to.x) + standoff : Math.min(from.x, to.x) - standoff;
    return [from, { x: edge, y: from.y }, { x: edge, y: to.y }, to];
  }
  if (Math.abs(to.y - from.y) <= ALIGNED && ahead >= 0) return [from, to];
  if (ahead >= 2 * standoff) {
    const middle = (from.x + to.x) / 2;
    return [from, { x: middle, y: from.y }, { x: middle, y: to.y }, to];
  }
  const into = to.x - dir * standoff;
  const between = (from.y + to.y) / 2;
  return [
    from,
    { x: out, y: from.y },
    { x: out, y: between },
    { x: into, y: between },
    { x: into, y: to.y },
    to,
  ];
}

/** Where a label sits on a line: half way along its middle run. */
export function labelPoint(points: readonly Point[]): Point {
  const at = Math.max(0, Math.floor((points.length - 2) / 2));
  const a = points[at] ?? { x: 0, y: 0 };
  const b = points[at + 1] ?? a;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

const coordinate = (n: number) => String(Math.round(n * 100) / 100);

/** SVG path data through the points with straight runs only. */
export const pathOf = (points: readonly Point[]) =>
  points.map((p, i) => `${i === 0 ? "M" : "L"} ${coordinate(p.x)} ${coordinate(p.y)}`).join(" ");

export type LineShape = "straight" | "angled" | "curved";
/** A drawn line: the points it passes through, plus the curve's control points when it bends smoothly. */
export type Line = { points: Point[]; controls?: readonly [Point, Point] };

const HOP = 5;
const CURVE_SAMPLES = 16;
const outward: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export function anchorOn(r: Rect, side: Side): Point {
  if (side === "top") return { x: r.x + r.width / 2, y: r.y };
  if (side === "bottom") return { x: r.x + r.width / 2, y: r.y + r.height };
  if (side === "left") return { x: r.x, y: r.y + r.height / 2 };
  return { x: r.x + r.width, y: r.y + r.height / 2 };
}

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

function bezier(p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point {
  const s = 1 - t;
  const at = (k: "x" | "y") =>
    s * s * s * p0[k] + 3 * s * s * t * c1[k] + 3 * s * t * t * c2[k] + t * t * t * p3[k];
  return { x: at("x"), y: at("y") };
}

export function lineBetween(
  from: Point,
  fromSide: Side,
  to: Point,
  toSide: Side,
  shape: LineShape,
  standoff = 0,
): Line {
  if (shape === "straight") return { points: [from, to] };
  if (shape === "angled") return { points: orthogonalPoints(from, fromSide, to, toSide, standoff) };
  const reach = Math.min(160, Math.max(24, distance(from, to) * 0.4));
  const c1 = { x: from.x + outward[fromSide].x * reach, y: from.y + outward[fromSide].y * reach };
  const c2 = { x: to.x + outward[toSide].x * reach, y: to.y + outward[toSide].y * reach };
  const points = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) =>
    bezier(from, c1, c2, to, i / CURVE_SAMPLES),
  );
  return { points, controls: [c1, c2] };
}

function segmentCross(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

/** Where a line crosses the other lines, in order along it. */
export function crossings(line: Line, others: readonly Line[]): Point[] {
  const found: Point[] = [];
  for (let i = 1; i < line.points.length; i++) {
    const a = line.points[i - 1];
    const b = line.points[i];
    const onRun: Point[] = [];
    for (const other of others) {
      for (let j = 1; j < other.points.length; j++) {
        const hit = segmentCross(a, b, other.points[j - 1], other.points[j]);
        if (hit) onRun.push(hit);
      }
    }
    found.push(...onRun.sort((p, q) => distance(a, p) - distance(a, q)));
  }
  return found;
}

function hopsPath(points: readonly Point[], hops: readonly Point[]): string {
  const parts = [`M ${coordinate(points[0].x)} ${coordinate(points[0].y)}`];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const run = distance(a, b);
    const u = run === 0 ? { x: 0, y: 0 } : { x: (b.x - a.x) / run, y: (b.y - a.y) / run };
    let reached = 0;
    for (const hop of hops) {
      const along = (hop.x - a.x) * u.x + (hop.y - a.y) * u.y;
      const off = Math.abs((hop.x - a.x) * u.y - (hop.y - a.y) * u.x);
      if (off > 0.5 || along - HOP < reached || along + HOP > run) continue;
      const before = { x: a.x + u.x * (along - HOP), y: a.y + u.y * (along - HOP) };
      const after = { x: a.x + u.x * (along + HOP), y: a.y + u.y * (along + HOP) };
      parts.push(`L ${coordinate(before.x)} ${coordinate(before.y)}`);
      parts.push(`A ${HOP} ${HOP} 0 0 1 ${coordinate(after.x)} ${coordinate(after.y)}`);
      reached = along + HOP;
    }
    parts.push(`L ${coordinate(b.x)} ${coordinate(b.y)}`);
  }
  return parts.join(" ");
}

/** The SVG path of a line; hops become small arcs, which only straight and right-angle lines draw. */
export function linePath(line: Line, hops: readonly Point[] = []): string {
  const { points, controls } = line;
  if (controls) {
    const [c1, c2] = controls;
    const end = points[points.length - 1];
    const xy = (p: Point) => `${coordinate(p.x)} ${coordinate(p.y)}`;
    return `M ${xy(points[0])} C ${xy(c1)} ${xy(c2)} ${xy(end)}`;
  }
  return hops.length === 0 ? pathOf(points) : hopsPath(points, hops);
}

function lengths(points: readonly Point[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + distance(points[i - 1], points[i]));
  return out;
}

/** The point a fraction t (0 to 1) of the way along a line. */
export function pointAt(points: readonly Point[], t: number): Point {
  const at = lengths(points);
  const total = at[at.length - 1];
  const want = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < points.length; i++) {
    if (at[i] >= want) {
      const run = at[i] - at[i - 1];
      const k = run === 0 ? 0 : (want - at[i - 1]) / run;
      const a = points[i - 1];
      const b = points[i];
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  return points[points.length - 1];
}

/** How far (0 to 1) along a line its nearest point to p lies. */
export function nearestAt(points: readonly Point[], p: Point): number {
  const at = lengths(points);
  const total = at[at.length - 1];
  if (total === 0) return 0;
  let best = { gap: Infinity, along: 0 };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const run = at[i] - at[i - 1];
    const k =
      run === 0
        ? 0
        : Math.min(
            1,
            Math.max(0, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / run ** 2),
          );
    const gap = distance(p, { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    if (gap < best.gap) best = { gap, along: at[i - 1] + run * k };
  }
  return best.along / total;
}
