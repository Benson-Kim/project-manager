import { z } from "zod";
import type { LineShape, Side } from "./connector-route";

/**
 * How a connector is drawn, shared by every diagram that lets people style its lines. A missing
 * value means the diagram's own default, so a line nobody styled keeps its usual look.
 */
export const LINE_SHAPES = ["straight", "angled", "curved"] as const satisfies readonly LineShape[];
export const LINE_PATTERNS = ["solid", "dashed", "dotted"] as const;
export const LINE_ENDS = ["none", "arrow", "open", "dot"] as const;
export const LINE_ATTACH = ["fixed", "floating"] as const;
export const LINE_SIDES = ["top", "right", "bottom", "left"] as const satisfies readonly Side[];
export const LINE_WEIGHTS = { min: 1, max: 6 } as const;
export const HEX_COLOUR = /^#[0-9A-Fa-f]{6}$/;

/** Mid-tone colours that keep at least 3:1 contrast on both the light and the dark canvas. */
export const LINE_COLOURS = [
  "#DC2626",
  "#D97706",
  "#16A34A",
  "#0D9488",
  "#2563EB",
  "#7C3AED",
  "#DB2777",
  "#64748B",
] as const;

export type LinePattern = (typeof LINE_PATTERNS)[number];
export type LineEnd = (typeof LINE_ENDS)[number];
export type LineAttach = (typeof LINE_ATTACH)[number];

export const connectorStyleSchema = z
  .object({
    shape: z.enum(LINE_SHAPES).nullable(),
    pattern: z.enum(LINE_PATTERNS).nullable(),
    startEnd: z.enum(LINE_ENDS).nullable(),
    endEnd: z.enum(LINE_ENDS).nullable(),
    weight: z.number().int().min(LINE_WEIGHTS.min).max(LINE_WEIGHTS.max).nullable(),
    colour: z.string().regex(HEX_COLOUR).nullable(),
    attach: z.enum(LINE_ATTACH).nullable(),
    sourceSide: z.enum(LINE_SIDES).nullable(),
    targetSide: z.enum(LINE_SIDES).nullable(),
    jumps: z.boolean().nullable(),
  })
  .strict();

export type ConnectorStyle = z.infer<typeof connectorStyleSchema>;

export const PLAIN_STYLE: ConnectorStyle = {
  shape: null,
  pattern: null,
  startEnd: null,
  endEnd: null,
  weight: null,
  colour: null,
  attach: null,
  sourceSide: null,
  targetSide: null,
  jumps: null,
};

export const isPlain = (style: ConnectorStyle) =>
  Object.values(style).every((value) => value === null);

/** The defaults a diagram fills in for every value nobody set. */
export type StyleDefaults = {
  shape: LineShape;
  pattern: LinePattern;
  startEnd: LineEnd;
  endEnd: LineEnd;
  sourceSide: Side;
  targetSide: Side;
};

export type DrawnStyle = StyleDefaults & {
  weight: number | null;
  colour: string | null;
  attach: LineAttach;
  jumps: boolean;
};

export function drawnStyle(style: ConnectorStyle, defaults: StyleDefaults): DrawnStyle {
  return {
    shape: style.shape ?? defaults.shape,
    pattern: style.pattern ?? defaults.pattern,
    startEnd: style.startEnd ?? defaults.startEnd,
    endEnd: style.endEnd ?? defaults.endEnd,
    sourceSide: style.sourceSide ?? defaults.sourceSide,
    targetSide: style.targetSide ?? defaults.targetSide,
    weight: style.weight,
    colour: style.colour,
    attach: style.attach ?? "fixed",
    jumps: style.jumps ?? false,
  };
}

/** The stroke dash for a pattern at a weight; a missing weight is the diagram's thin default. */
export function dashFor(pattern: LinePattern, weight: number | null): string | undefined {
  const width = weight ?? 1;
  if (pattern === "dashed") {
    const k = Math.max(1, width / 2);
    return `${6 * k} ${4 * k}`;
  }
  if (pattern === "dotted") return `0 ${width * 2 + 2}`;
  return undefined;
}
