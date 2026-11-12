import type { ShapeKind } from "../model/diagram";
import { glyph, SHAPE_SPECS, type Paint, type Primitive, type Tone } from "../model/shapes";

/** Screen colours: the theme's surface and ink, with symbol tones that read on light and dark. */
export const SCREEN_TONES: Record<Tone, string> = {
  start: "#16a34a",
  intermediate: "#d97706",
  end: "#dc2626",
  activity: "var(--accent)",
  gateway: "var(--ink-muted)",
  artifact: "var(--ink-muted)",
};

function paintStyle(paint: Paint, tone: string, weight: number) {
  return {
    fill: paint === "solid" ? tone : paint === "outline" ? "var(--surface)" : "none",
    stroke: tone,
    strokeWidth: weight,
    strokeLinejoin: "round" as const,
  };
}

function PrimitiveView({ primitive, tone }: { primitive: Primitive; tone: string }) {
  const style = paintStyle(primitive.paint, tone, primitive.weight);
  if (primitive.tag === "circle")
    return <circle cx={primitive.cx} cy={primitive.cy} r={primitive.r} style={style} />;
  if (primitive.tag === "rect")
    return (
      <rect
        x={primitive.x}
        y={primitive.y}
        width={primitive.width}
        height={primitive.height}
        rx={primitive.rx}
        style={style}
      />
    );
  return <path d={primitive.d} style={style} />;
}

/** One BPMN symbol at the given size, drawn from the same primitives as the export. */
export function Glyph({
  kind,
  width,
  height,
  className,
}: {
  kind: ShapeKind;
  width: number;
  height: number;
  className?: string;
}) {
  const tone = SCREEN_TONES[SHAPE_SPECS[kind].tone];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
      overflow="visible"
    >
      {glyph(kind, width, height).map((primitive, i) => (
        <PrimitiveView key={i} primitive={primitive} tone={tone} />
      ))}
    </svg>
  );
}

/** A palette preview: the symbol scaled into a square, keeping its proportions. */
export function GlyphIcon({ kind, size = 28 }: { kind: ShapeKind; size?: number }) {
  const spec = SHAPE_SPECS[kind];
  const scale = size / Math.max(spec.width, spec.height);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <g
        transform={`translate(${(size - spec.width * scale) / 2} ${(size - spec.height * scale) / 2}) scale(${scale})`}
      >
        {glyph(kind, spec.width, spec.height).map((primitive, i) => (
          <PrimitiveView key={i} primitive={primitive} tone={SCREEN_TONES[spec.tone]} />
        ))}
      </g>
    </svg>
  );
}
