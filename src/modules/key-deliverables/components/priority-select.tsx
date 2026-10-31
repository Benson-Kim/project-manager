"use client";

import { ListOptions, useLookupLists } from "@/components/ui/lookup-lists";
import { TONES } from "@/components/ui/tones";
import { optionColor } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";

const C = messages.keyDeliverables.wbs.card;

export const priorityChip =
  "inline-flex min-h-6 max-w-full shrink-0 cursor-pointer items-center rounded-full border border-line bg-surface px-2 text-xs font-medium text-ink hover:bg-surface-raised focus:border-focus focus:outline-none";

/** The Gantt card's small chip, in the priority's own colour when the list gives it one. */
const compactChip =
  "inline-flex max-w-28 shrink-0 cursor-pointer appearance-none items-center rounded-sm border px-1.5 py-px text-[10px] font-medium focus:outline-2 focus:outline-focus";

/** An item's priority as a chip that opens the managed list; the empty choice clears it. */
export function PrioritySelect({
  name,
  value,
  onChange,
  testId,
  tabIndex,
  compact = false,
}: {
  /** The item's name, for the spoken label. */
  name: string;
  value: string | null;
  onChange: (priority: string | null) => void;
  testId: string;
  tabIndex?: number;
  compact?: boolean;
}) {
  const { lists } = useLookupLists();
  const tone = compact ? optionColor(lists["key-deliverable.priority"], value) : null;
  return (
    <select
      aria-label={C.priorityOf(name)}
      data-testid={testId}
      tabIndex={tabIndex}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
      onDoubleClick={(event) => event.stopPropagation()}
      className={
        compact
          ? `${compactChip} ${tone ? TONES[tone].badge : "border-line bg-surface text-ink"}`
          : priorityChip
      }
    >
      <option value="">{C.noPriority}</option>
      <ListOptions list="key-deliverable.priority" current={value} />
    </select>
  );
}

/** A viewer's read-only priority, drawn like the compact chip. */
export function PriorityChip({ value }: { value: string | null }) {
  const { lists } = useLookupLists();
  const tone = optionColor(lists["key-deliverable.priority"], value);
  return (
    <span
      className={`${compactChip} cursor-default ${tone ? TONES[tone].badge : "border-line bg-surface text-ink"}`}
    >
      {value ?? C.noPriority}
    </span>
  );
}
