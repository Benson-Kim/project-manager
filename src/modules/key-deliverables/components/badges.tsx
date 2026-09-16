import { messages } from "@/lib/messages";

/**
 * Status/priority badges + the overdue danger badge (issue #9: overdue gets a
 * danger badge in both views, no tooltip — the date is visible). Colour
 * classes copied from passing components (LESSONS §13): text-ink on
 * surface-sunken, text-on-accent on danger-solid equivalents avoided — the
 * danger badge uses the danger text colour on a bordered chip.
 */
export function Badge({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink">
      {value}
    </span>
  );
}

export function OverdueBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-danger px-2 py-0.5 text-xs font-medium text-danger">
      {messages.keyDeliverables.overdue}
    </span>
  );
}
