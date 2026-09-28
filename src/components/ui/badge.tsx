/**
 * Badge — inline pill that colour-codes a status or priority value.
 * Designed to be context-free: callers pass any string and the component
 * picks a variant based on known vocabulary; unknowns fall back to neutral.
 */

const VARIANT_MAP: Record<string, string> = {
  // Status
  "Not Started": "bg-surface-raised border-line text-ink-muted",
  "In Progress": "bg-blue-50 border-blue-200 text-blue-700",
  "In Review": "bg-purple-50 border-purple-200 text-purple-700",
  Completed: "bg-green-50 border-green-200 text-green-700",
  Cancelled: "bg-surface-raised border-line text-ink-muted line-through",
  // Priority
  Critical: "bg-red-50 border-red-200 text-red-700",
  High: "bg-orange-50 border-orange-200 text-orange-700",
  Medium: "bg-amber-50 border-amber-200 text-amber-700",
  Low: "bg-surface-raised border-line text-ink-muted",
  // Type
  Project: "bg-blue-50 border-blue-200 text-blue-700",
  "Daily Activity": "bg-teal-50 border-teal-200 text-teal-700",
  None: "bg-surface-raised border-line text-ink-muted",
};

const DEFAULT_CLASS =
  "bg-surface-raised border-line text-ink-muted";

export function Badge({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  const cls = VARIANT_MAP[value] ?? DEFAULT_CLASS;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {value}
    </span>
  );
}
