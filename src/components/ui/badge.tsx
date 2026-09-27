
/* Status/priority badges */

import type { HTMLAttributes } from "react";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

type BadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  value: string | null | undefined;
  tone?: BadgeTone;
  showDot?: boolean;
  bordered?: boolean;
};

const toneClasses: Record<
  BadgeTone,
  { text: string; dot: string }
> = {
  neutral: {
    text: "text-ink-muted",
    dot: "bg-ink-muted",
  },
  success: {
    text: "text-success-700",
    dot: "bg-success-600",
  },
  warning: {
    text: "text-warning-700",
    dot: "bg-warning-600",
  },
  danger: {
    text: "text-danger-700",
    dot: "bg-danger-600",
  },
  info: {
    text: "text-info-700",
    dot: "bg-info-600",
  },
};

export function Badge({
  value,
  tone = "neutral",
  showDot = true,
  bordered = false,
  className = "",
  ...props
}: BadgeProps) {
  const label = value?.trim();

  if (!label) return null;

  const colors = toneClasses[tone];

  return (
    <span
      {...props}
      className={[
        "inline-flex items-center gap-1.5 text-xs font-medium leading-5",
        colors.text,
        bordered && "rounded-full border border-line px-2 py-0.5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showDot && (
        <span
          aria-hidden="true"
          className={`size-1.5 shrink-0 rounded-full ${colors.dot}`}
        />
      )}
      {label}
    </span>
  );
}