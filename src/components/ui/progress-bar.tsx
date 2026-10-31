/** A whole percentage from 0 to 100; anything that is not a finite number reads as 0. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)));
}

/** A completion bar with its percentage, announced as a progressbar. */
export function ProgressBar({
  value,
  label,
  showValue = true,
  className = "",
  fill,
  valueClassName = "text-xs text-ink-muted",
}: {
  value: number;
  /** Accessible name, e.g. "Work complete". */
  label: string;
  showValue?: boolean;
  className?: string;
  /** The bar's colour class; by default accent, success once complete. */
  fill?: string;
  valueClassName?: string;
}) {
  const percent = clampPercent(value);
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      <span
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="block h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-surface-sunken print:[print-color-adjust:exact]"
      >
        <span
          className={`block h-full rounded-full transition-[width] duration-(--duration-base) ${fill ?? (percent === 100 ? "bg-success" : "bg-accent-strong")}`}
          style={{ width: `${percent}%` }}
        />
      </span>
      {showValue ? (
        <span aria-hidden="true" className={`${valueClassName} tabular-nums`}>
          {percent}%
        </span>
      ) : null}
    </span>
  );
}
