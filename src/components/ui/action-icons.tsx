const STROKE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** The one Undo arrow; Redo is the same arrow mirrored. */
export function UndoIcon({ redo, className = "size-5" }: { redo?: boolean; className?: string }) {
  return (
    <svg
      {...STROKE}
      data-icon={redo ? "redo" : "undo"}
      className={`${className} ${redo ? "-scale-x-100" : ""}`}
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

/** The dotted handle on a thing that can be dragged. */
export function GripIcon({
  className = "h-3.5 w-2 shrink-0 fill-ink-muted",
}: {
  className?: string;
}) {
  return (
    <svg aria-hidden="true" viewBox="0 0 8 14" data-icon="grip" className={className}>
      {[1, 7, 13].flatMap((cy) =>
        [1, 7].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1" />),
      )}
    </svg>
  );
}

/** The one bin icon for deleting a thing. */
export function BinIcon({ className = "size-4 shrink-0" }: { className?: string }) {
  return (
    <svg {...STROKE} data-icon="bin" className={className}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
