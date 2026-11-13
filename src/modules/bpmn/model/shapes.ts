import {
  ACTIVITY_KINDS,
  ARTIFACT_KINDS,
  EVENT_KINDS,
  GATEWAY_KINDS,
  type FlowKind,
  type ShapeKind,
} from "./diagram";

/**
 * One home for what each BPMN symbol looks like (ADR-0064). The canvas draws these primitives as
 * React SVG and the export writes them as SVG text, so the screen, the PNG and the printout agree.
 */

export type ShapeGroup = "events" | "activities" | "gateways" | "artifacts";
export type Tone = "start" | "intermediate" | "end" | "activity" | "gateway" | "artifact";
export type LabelPlace = "inside" | "below" | "annotation";

/** outline: tone stroke over the surface; solid: filled with the tone; mark: tone stroke, no fill. */
export type Paint = "outline" | "solid" | "mark";
export type Primitive =
  | { tag: "circle"; cx: number; cy: number; r: number; paint: Paint; weight: number }
  | {
      tag: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      rx: number;
      paint: Paint;
      weight: number;
    }
  | { tag: "path"; d: string; paint: Paint; weight: number };

export interface ShapeSpec {
  kind: ShapeKind;
  group: ShapeGroup;
  width: number;
  height: number;
  labelPlace: LabelPlace;
  tone: Tone;
}

const EVENT_TONE: Record<(typeof EVENT_KINDS)[number], Tone> = {
  startEvent: "start",
  messageStartEvent: "start",
  timerStartEvent: "start",
  intermediateEvent: "intermediate",
  timerIntermediateEvent: "intermediate",
  errorIntermediateEvent: "intermediate",
  endEvent: "end",
  terminateEndEvent: "end",
};

function spec(kind: ShapeKind): ShapeSpec {
  if ((EVENT_KINDS as readonly string[]).includes(kind))
    return {
      kind,
      group: "events",
      width: 40,
      height: 40,
      labelPlace: "below",
      tone: EVENT_TONE[kind as (typeof EVENT_KINDS)[number]],
    };
  if ((ACTIVITY_KINDS as readonly string[]).includes(kind)) {
    const wide = kind === "subProcess";
    return {
      kind,
      group: "activities",
      width: wide ? 140 : 120,
      height: wide ? 90 : 80,
      labelPlace: "inside",
      tone: "activity",
    };
  }
  if ((GATEWAY_KINDS as readonly string[]).includes(kind))
    return { kind, group: "gateways", width: 50, height: 50, labelPlace: "below", tone: "gateway" };
  if (kind === "textAnnotation")
    return {
      kind,
      group: "artifacts",
      width: 120,
      height: 50,
      labelPlace: "annotation",
      tone: "artifact",
    };
  return {
    kind,
    group: "artifacts",
    width: kind === "dataObject" ? 40 : 50,
    height: 50,
    labelPlace: "below",
    tone: "artifact",
  };
}

export const SHAPE_SPECS: Record<ShapeKind, ShapeSpec> = Object.fromEntries(
  [...EVENT_KINDS, ...ACTIVITY_KINDS, ...GATEWAY_KINDS, ...ARTIFACT_KINDS].map((kind) => [
    kind,
    spec(kind),
  ]),
) as Record<ShapeKind, ShapeSpec>;

export const PALETTE_GROUPS: { group: ShapeGroup; kinds: readonly ShapeKind[] }[] = [
  { group: "events", kinds: EVENT_KINDS },
  { group: "activities", kinds: ACTIVITY_KINDS },
  { group: "gateways", kinds: GATEWAY_KINDS },
  { group: "artifacts", kinds: ARTIFACT_KINDS },
];

const round = (n: number) => Math.round(n * 10) / 10;
const p = (...parts: (string | number)[]) =>
  parts.map((part) => (typeof part === "number" ? round(part) : part)).join(" ");

function envelope(cx: number, cy: number, r: number): Primitive[] {
  const w = r * 1.1;
  const h = r * 0.75;
  const x = cx - w / 2;
  const y = cy - h / 2;
  return [
    {
      tag: "rect",
      x: round(x),
      y: round(y),
      width: round(w),
      height: round(h),
      rx: 0,
      paint: "mark",
      weight: 1.5,
    },
    {
      tag: "path",
      d: p("M", x, y, "L", cx, cy + h * 0.1, "L", x + w, y),
      paint: "mark",
      weight: 1.5,
    },
  ];
}

function clock(cx: number, cy: number, r: number): Primitive[] {
  const face = r * 0.62;
  return [
    { tag: "circle", cx: round(cx), cy: round(cy), r: round(face), paint: "mark", weight: 1.5 },
    {
      tag: "path",
      d: p("M", cx, cy - face * 0.7, "L", cx, cy, "L", cx + face * 0.5, cy),
      paint: "mark",
      weight: 1.5,
    },
  ];
}

function bolt(cx: number, cy: number, r: number): Primitive {
  const s = r * 0.62;
  return {
    tag: "path",
    d: p(
      "M",
      cx - 0.45 * s,
      cy + 0.7 * s,
      "L",
      cx - 0.15 * s,
      cy - 0.65 * s,
      "L",
      cx + 0.15 * s,
      cy - 0.05 * s,
      "L",
      cx + 0.45 * s,
      cy - 0.7 * s,
      "L",
      cx + 0.15 * s,
      cy + 0.65 * s,
      "L",
      cx - 0.15 * s,
      cy + 0.05 * s,
      "Z",
    ),
    paint: "mark",
    weight: 1.5,
  };
}

function eventGlyph(kind: ShapeKind, w: number, h: number): Primitive[] {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 2;
  const ring = (weight: number): Primitive => ({
    tag: "circle",
    cx,
    cy,
    r,
    paint: "outline",
    weight,
  });
  const inner: Primitive = { tag: "circle", cx, cy, r: r - 3.5, paint: "mark", weight: 1.5 };
  switch (kind) {
    case "messageStartEvent":
      return [ring(2), ...envelope(cx, cy, r)];
    case "timerStartEvent":
      return [ring(2), ...clock(cx, cy, r)];
    case "intermediateEvent":
      return [ring(1.5), inner];
    case "timerIntermediateEvent":
      return [ring(1.5), inner, ...clock(cx, cy, r)];
    case "errorIntermediateEvent":
      return [ring(1.5), inner, bolt(cx, cy, r)];
    case "endEvent":
      return [ring(4)];
    case "terminateEndEvent":
      return [ring(4), { tag: "circle", cx, cy, r: round(r * 0.55), paint: "solid", weight: 1 }];
    default:
      return [ring(2)];
  }
}

function activityGlyph(kind: ShapeKind, w: number, h: number): Primitive[] {
  const box: Primitive = {
    tag: "rect",
    x: 1,
    y: 1,
    width: w - 2,
    height: h - 2,
    rx: 10,
    paint: "outline",
    weight: kind === "callActivity" ? 4 : 2,
  };
  switch (kind) {
    case "userTask":
      return [
        box,
        { tag: "circle", cx: 16, cy: 13, r: 4, paint: "mark", weight: 1.5 },
        { tag: "path", d: "M 9 26 Q 9 18 16 18 Q 23 18 23 26 Z", paint: "mark", weight: 1.5 },
      ];
    case "serviceTask": {
      const spokes = Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return p(
          "M",
          16 + 5 * Math.cos(a),
          16 + 5 * Math.sin(a),
          "L",
          16 + 8.5 * Math.cos(a),
          16 + 8.5 * Math.sin(a),
        );
      }).join(" ");
      return [
        box,
        { tag: "path", d: spokes, paint: "mark", weight: 2 },
        { tag: "circle", cx: 16, cy: 16, r: 5, paint: "mark", weight: 1.5 },
      ];
    }
    case "scriptTask":
      return [
        box,
        {
          tag: "path",
          d: "M 12 8 L 24 8 Q 20 16 24 24 L 12 24 Q 16 16 12 8 Z",
          paint: "mark",
          weight: 1.5,
        },
        {
          tag: "path",
          d: "M 15 12 L 21 12 M 16 16 L 21 16 M 15 20 L 21 20",
          paint: "mark",
          weight: 1,
        },
      ];
    case "subProcess":
      return [
        box,
        {
          tag: "rect",
          x: round(w / 2 - 7),
          y: h - 17,
          width: 14,
          height: 14,
          rx: 0,
          paint: "mark",
          weight: 1.5,
        },
        {
          tag: "path",
          d: p(
            "M",
            w / 2,
            h - 14,
            "L",
            w / 2,
            h - 6,
            "M",
            w / 2 - 4,
            h - 10,
            "L",
            w / 2 + 4,
            h - 10,
          ),
          paint: "mark",
          weight: 1.5,
        },
      ];
    default:
      return [box];
  }
}

function gatewayGlyph(kind: ShapeKind, w: number, h: number): Primitive[] {
  const cx = w / 2;
  const cy = h / 2;
  const diamond: Primitive = {
    tag: "path",
    d: p("M", cx, 1, "L", w - 1, cy, "L", cx, h - 1, "L", 1, cy, "Z"),
    paint: "outline",
    weight: 2,
  };
  const s = w * 0.16;
  switch (kind) {
    case "exclusiveGateway":
      return [
        diamond,
        {
          tag: "path",
          d: p("M", cx - s, cy - s, "L", cx + s, cy + s, "M", cx + s, cy - s, "L", cx - s, cy + s),
          paint: "mark",
          weight: 3.5,
        },
      ];
    case "parallelGateway": {
      const t = w * 0.22;
      return [
        diamond,
        {
          tag: "path",
          d: p("M", cx, cy - t, "L", cx, cy + t, "M", cx - t, cy, "L", cx + t, cy),
          paint: "mark",
          weight: 3.5,
        },
      ];
    }
    case "inclusiveGateway":
      return [diamond, { tag: "circle", cx, cy, r: round(w * 0.2), paint: "mark", weight: 2.5 }];
    default: {
      const r = w * 0.17;
      const pentagon = Array.from({ length: 5 }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        return `${i === 0 ? "M" : "L"} ${round(cx + r * 0.7 * Math.cos(a))} ${round(cy + r * 0.7 * Math.sin(a))}`;
      }).join(" ");
      return [
        diamond,
        { tag: "circle", cx, cy, r: round(w * 0.23), paint: "mark", weight: 1.2 },
        { tag: "circle", cx, cy, r: round(w * 0.19), paint: "mark", weight: 1.2 },
        { tag: "path", d: `${pentagon} Z`, paint: "mark", weight: 1.2 },
      ];
    }
  }
}

function artifactGlyph(kind: ShapeKind, w: number, h: number): Primitive[] {
  if (kind === "textAnnotation")
    return [
      {
        tag: "path",
        d: p("M", 12, 1, "L", 1, 1, "L", 1, h - 1, "L", 12, h - 1),
        paint: "mark",
        weight: 1.5,
      },
    ];
  if (kind === "dataObject")
    return [
      {
        tag: "path",
        d: p("M", 1, 1, "L", w - 12, 1, "L", w - 1, 12, "L", w - 1, h - 1, "L", 1, h - 1, "Z"),
        paint: "outline",
        weight: 1.5,
      },
      {
        tag: "path",
        d: p("M", w - 12, 1, "L", w - 12, 12, "L", w - 1, 12),
        paint: "mark",
        weight: 1.5,
      },
    ];
  const rx = w / 2 - 1;
  const ry = h * 0.12;
  const arc = (y: number) => p("M", 1, y, "A", rx, ry, 0, 0, 0, w - 1, y);
  return [
    {
      tag: "path",
      d: p(
        "M",
        1,
        ry + 1,
        "L",
        1,
        h - ry - 1,
        "A",
        rx,
        ry,
        0,
        0,
        0,
        w - 1,
        h - ry - 1,
        "L",
        w - 1,
        ry + 1,
        "A",
        rx,
        ry,
        0,
        0,
        0,
        1,
        ry + 1,
        "Z",
      ),
      paint: "outline",
      weight: 1.5,
    },
    { tag: "path", d: p(arc(ry + 1), "A", rx, ry, 0, 0, 0, 1, ry + 1), paint: "mark", weight: 1.5 },
    { tag: "path", d: `${arc(ry * 2 + 2)} ${arc(ry * 3 + 3)}`, paint: "mark", weight: 1.5 },
  ];
}

/** The primitives that draw one symbol in a box of w x h, origin at its top left. */
export function glyph(kind: ShapeKind, w: number, h: number): Primitive[] {
  const { group } = SHAPE_SPECS[kind];
  if (group === "events") return eventGlyph(kind, w, h);
  if (group === "activities") return activityGlyph(kind, w, h);
  if (group === "gateways") return gatewayGlyph(kind, w, h);
  return artifactGlyph(kind, w, h);
}

/** Artifacts join the process by association, whatever connector is picked. */
export function flowKindFor(source: ShapeKind, target: ShapeKind, picked: FlowKind): FlowKind {
  const artifact = (kind: ShapeKind) => SHAPE_SPECS[kind].group === "artifacts";
  return artifact(source) || artifact(target) ? "association" : picked;
}

/** Events, gateways and artifacts can only be drawn at their own proportions. */
export const isResizable = (kind: ShapeKind) =>
  SHAPE_SPECS[kind].group === "activities" || kind === "textAnnotation";
