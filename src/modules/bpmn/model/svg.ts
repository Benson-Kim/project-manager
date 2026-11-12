import { getSmoothStepPath, Position } from "@xyflow/react";
import type { BpmnDiagram, BpmnFlow, BpmnPool, BpmnShape, FlowKind, Side } from "./diagram";
import {
  diagramBounds,
  LANE_HEADER,
  laneRects,
  POOL_HEADER,
  poolRect,
  sidePoint,
  type Point,
} from "./edit";
import { glyph, SHAPE_SPECS, type Paint, type Primitive, type Tone } from "./shapes";

/**
 * The whole diagram as one SVG document (ADR-0064), drawn from the model rather than read off the
 * screen, so PNG and print show every element whatever the zoom, on white, in both themes.
 */

export interface Palette {
  surface: string;
  ink: string;
  muted: string;
  line: string;
  laneHeader: string;
  tones: Record<Tone, string>;
}

/** Fixed colours for paper and images: the app's tokens change with the theme. */
export const PRINT_PALETTE: Palette = {
  surface: "#ffffff",
  ink: "#111827",
  muted: "#4b5563",
  line: "#6b7280",
  laneHeader: "#f3f4f6",
  tones: {
    start: "#15803d",
    intermediate: "#b45309",
    end: "#b91c1c",
    activity: "#1d4ed8",
    gateway: "#374151",
    artifact: "#374151",
  },
};

export const SIDE_POSITION: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

export const FLOW_DASH: Record<FlowKind, string | undefined> = {
  sequence: undefined,
  default: undefined,
  message: "7 5",
  association: "2 4",
};

const MARGIN = 40;
const FONT = 12;
const CHAR_WIDTH = 6.6;
const LINE_HEIGHT = 15;

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Breaks text into lines of at most `max` characters, at spaces where it can. */
export function wrapText(text: string, max: number): string[] {
  const width = Math.max(1, max);
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = word;
      while (rest.length > width) {
        if (line) lines.push(line);
        lines.push(rest.slice(0, width));
        line = "";
        rest = rest.slice(width);
      }
      if (!line) line = rest;
      else if (line.length + 1 + rest.length <= width) line = `${line} ${rest}`;
      else {
        lines.push(line);
        line = rest;
      }
    }
    lines.push(line);
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** The route a flow takes; the canvas draws the same path. */
export function flowPath(
  diagram: BpmnDiagram,
  flow: BpmnFlow,
): { d: string; labelAt: Point; start: Point; side: Side } | null {
  const source = diagram.shapes.find((shape) => shape.id === flow.source);
  const target = diagram.shapes.find((shape) => shape.id === flow.target);
  if (!source || !target) return null;
  const start = sidePoint(source, flow.sourceSide);
  const end = sidePoint(target, flow.targetSide);
  const [d, labelX, labelY] = getSmoothStepPath({
    sourceX: start.x,
    sourceY: start.y,
    sourcePosition: SIDE_POSITION[flow.sourceSide],
    targetX: end.x,
    targetY: end.y,
    targetPosition: SIDE_POSITION[flow.targetSide],
    borderRadius: 6,
  });
  return { d, labelAt: { x: labelX, y: labelY }, start, side: flow.sourceSide };
}

const DIRECTION: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

/** The slash a default flow carries just after it leaves its source. */
export function defaultSlash(start: Point, side: Side): string {
  const dir = DIRECTION[side];
  const across = { x: -dir.y, y: dir.x };
  const mid = { x: start.x + dir.x * 12, y: start.y + dir.y * 12 };
  const a = { x: mid.x + across.x * 6 - dir.x * 4, y: mid.y + across.y * 6 - dir.y * 4 };
  const b = { x: mid.x - across.x * 6 + dir.x * 4, y: mid.y - across.y * 6 + dir.y * 4 };
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}

function paintAttrs(paint: Paint, tone: string, palette: Palette, weight: number): string {
  const fill = paint === "solid" ? tone : paint === "outline" ? palette.surface : "none";
  return `fill="${fill}" stroke="${tone}" stroke-width="${weight}"`;
}

function primitiveSvg(primitive: Primitive, tone: string, palette: Palette): string {
  const attrs = paintAttrs(primitive.paint, tone, palette, primitive.weight);
  if (primitive.tag === "circle")
    return `<circle cx="${primitive.cx}" cy="${primitive.cy}" r="${primitive.r}" ${attrs}/>`;
  if (primitive.tag === "rect")
    return `<rect x="${primitive.x}" y="${primitive.y}" width="${primitive.width}" height="${primitive.height}" rx="${primitive.rx}" ${attrs}/>`;
  return `<path d="${primitive.d}" ${attrs} stroke-linejoin="round"/>`;
}

function textBlock(
  lines: string[],
  x: number,
  y: number,
  anchor: "start" | "middle",
  color: string,
): string {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + i * LINE_HEIGHT}" font-size="${FONT}" text-anchor="${anchor}" fill="${color}">${escapeXml(line)}</text>`,
    )
    .join("");
}

function shapeSvg(shape: BpmnShape, palette: Palette): string {
  const spec = SHAPE_SPECS[shape.kind];
  const tone = palette.tones[spec.tone];
  const body = glyph(shape.kind, shape.width, shape.height)
    .map((primitive) => primitiveSvg(primitive, tone, palette))
    .join("");
  let label = "";
  if (shape.label) {
    if (spec.labelPlace === "inside") {
      const lines = wrapText(shape.label, Math.floor((shape.width - 12) / CHAR_WIDTH));
      const top = shape.height / 2 - ((lines.length - 1) * LINE_HEIGHT) / 2 + FONT / 3;
      label = textBlock(lines, shape.width / 2, top, "middle", palette.ink);
    } else if (spec.labelPlace === "annotation") {
      const lines = wrapText(shape.label, Math.floor((shape.width - 14) / CHAR_WIDTH));
      label = textBlock(lines, 8, FONT + 4, "start", palette.ink);
    } else {
      const lines = wrapText(shape.label, 18);
      label = textBlock(lines, shape.width / 2, shape.height + FONT + 4, "middle", palette.ink);
    }
  }
  return `<g transform="translate(${shape.x} ${shape.y})">${body}${label}</g>`;
}

function verticalLabel(text: string, x: number, y: number, height: number, color: string) {
  const cx = x + POOL_HEADER / 2;
  const cy = y + height / 2;
  const max = Math.max(1, Math.floor((height - 8) / CHAR_WIDTH));
  const shown = text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
  return `<text x="${cx}" y="${cy}" font-size="${FONT}" font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="${color}" transform="rotate(-90 ${cx} ${cy})">${escapeXml(shown)}</text>`;
}

function poolSvg(pool: BpmnPool, palette: Palette): string {
  const rect = poolRect(pool);
  const parts = [
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="none" stroke="${palette.line}" stroke-width="1.5"/>`,
    `<rect x="${rect.x}" y="${rect.y}" width="${POOL_HEADER}" height="${rect.height}" fill="${palette.laneHeader}" stroke="${palette.line}" stroke-width="1.5"/>`,
    verticalLabel(pool.name, rect.x, rect.y, rect.height, palette.ink),
  ];
  if (pool.lanes.length > 1) {
    const x = rect.x + POOL_HEADER;
    laneRects(pool).forEach((lane, i) => {
      parts.push(
        `<rect x="${x}" y="${lane.y}" width="${rect.width - POOL_HEADER}" height="${lane.height}" fill="none" stroke="${palette.line}" stroke-width="1"/>`,
        `<rect x="${x}" y="${lane.y}" width="${LANE_HEADER}" height="${lane.height}" fill="${palette.laneHeader}" stroke="${palette.line}" stroke-width="1"/>`,
        verticalLabel(pool.lanes[i]!.name, x, lane.y, lane.height, palette.muted),
      );
    });
  }
  return parts.join("");
}

function markers(palette: Palette): string {
  const c = palette.ink;
  return `<defs>
<marker id="bpmn-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="${c}"/></marker>
<marker id="bpmn-open-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="${palette.surface}" stroke="${c}" stroke-width="1"/></marker>
<marker id="bpmn-circle" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8"><circle cx="5" cy="5" r="4" fill="${palette.surface}" stroke="${c}" stroke-width="1"/></marker>
</defs>`;
}

const MARKER_END: Record<FlowKind, string | null> = {
  sequence: "bpmn-arrow",
  default: "bpmn-arrow",
  message: "bpmn-open-arrow",
  association: null,
};

function flowSvg(diagram: BpmnDiagram, flow: BpmnFlow, palette: Palette): string {
  const route = flowPath(diagram, flow);
  if (!route) return "";
  const dash = FLOW_DASH[flow.kind];
  const end = MARKER_END[flow.kind];
  const parts = [
    `<path d="${route.d}" fill="none" stroke="${palette.ink}" stroke-width="1.5"${dash ? ` stroke-dasharray="${dash}"` : ""}${end ? ` marker-end="url(#${end})"` : ""}${flow.kind === "message" ? ` marker-start="url(#bpmn-circle)"` : ""}/>`,
  ];
  if (flow.kind === "default")
    parts.push(
      `<path d="${defaultSlash(route.start, route.side)}" stroke="${palette.ink}" stroke-width="1.5"/>`,
    );
  if (flow.label) {
    const lines = wrapText(flow.label, 24);
    const width = Math.max(...lines.map((line) => line.length)) * CHAR_WIDTH + 8;
    const height = lines.length * LINE_HEIGHT + 4;
    const { x, y } = route.labelAt;
    parts.push(
      `<rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}" rx="3" fill="${palette.surface}" opacity="0.9"/>`,
      textBlock(lines, x, y - height / 2 + FONT + 1, "middle", palette.ink),
    );
  }
  return parts.join("");
}

/** The diagram as SVG text with its size; an empty diagram is a small blank page. */
export function diagramSvg(
  diagram: BpmnDiagram,
  palette: Palette = PRINT_PALETTE,
): { svg: string; width: number; height: number } {
  const bounds = diagramBounds(diagram) ?? { x: 0, y: 0, width: 200, height: 100 };
  const x = Math.floor(bounds.x - MARGIN);
  const y = Math.floor(bounds.y - MARGIN);
  const width = Math.ceil(bounds.width + MARGIN * 2);
  const height = Math.ceil(bounds.height + MARGIN * 2);
  const body = [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${palette.surface}"/>`,
    ...diagram.pools.map((pool) => poolSvg(pool, palette)),
    ...diagram.flows.map((flow) => flowSvg(diagram, flow, palette)),
    ...diagram.shapes.map((shape) => shapeSvg(shape, palette)),
  ].join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}" font-family="Segoe UI, Arial, sans-serif">${markers(palette)}${body}</svg>`;
  return { svg, width, height };
}
