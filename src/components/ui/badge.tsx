import type { OptionColor } from "@/lib/lookup-lists";
import { TONES } from "./tones";

/**
 * Badge — inline pill that colour-codes a status or priority value.
 * Designed to be context-free: callers pass any string and the component
 * picks a variant based on known vocabulary; unknowns fall back to neutral.
 */

const VARIANT_MAP: Record<string, string> = {
  // Status — design tokens only (verified WCAG 2.2 AA in globals.css)
  "Not Started": "bg-surface-raised border-line text-ink-muted",
  "In Progress": "bg-accent-soft border-accent text-accent-strong",
  "In Review": "bg-accent-soft border-accent text-accent-strong",
  Completed: "bg-success border-success text-on-success",
  Cancelled: "bg-surface-raised border-line text-ink-muted line-through",
  // Priority
  Critical: "bg-danger border-danger text-on-danger",
  High: "bg-danger-soft border-danger text-danger",
  Medium: "bg-warning-soft border-warning text-warning",
  Low: "bg-surface-raised border-line text-ink-muted",
  // Type
  Project: "bg-accent-soft border-accent text-accent-strong",
  "Daily Activity": "bg-accent-soft border-accent text-accent-strong",
  None: "bg-surface-raised border-line text-ink-muted",
};

const DEFAULT_CLASS = "bg-surface-raised border-line text-ink-muted";

/**
 * `tone`: the value's colour from its managed list (migration 020) — set by an
 * Admin, it wins over the built-in vocabulary above.
 */
export function Badge({
  value,
  tone,
}: {
  value: string | null | undefined;
  tone?: OptionColor | null;
}) {
  if (!value) return null;
  const cls = tone ? TONES[tone].badge : (VARIANT_MAP[value] ?? DEFAULT_CLASS);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {value}
    </span>
  );
}
