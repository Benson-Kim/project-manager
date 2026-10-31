import { toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import type { MilestoneChip } from "../schemas/wbs-milestones";

const S = messages.keyDeliverables.wbs.milestoneStrip;
const CHIP = "flex items-center gap-1.5 px-2.5 py-0.5";

/**
 * The plan's milestones above the project box: a filled diamond once its day has come. With
 * `onSelect` each chip selects its milestone, for the ones the chart draws nowhere else.
 */
export function MilestoneStrip({
  chips,
  selectedId = null,
  onSelect,
}: {
  chips: readonly MilestoneChip[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <ul
      aria-label={S.label}
      data-testid="wbs-milestone-strip"
      className="m-0 mb-4 flex max-w-176 list-none flex-wrap items-center justify-center gap-2 p-0"
    >
      {chips.map((chip) => {
        const state = chip.reached ? S.reached : S.upcoming;
        const body = (
          <>
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rotate-45 border-2 border-ink ${chip.reached ? "bg-ink" : ""}`}
            />
            <span>{chip.name || messages.keyDeliverables.deliverableFallback(chip.id)}</span>
            <span className="font-normal text-ink-muted tabular-nums">
              {chip.date ? toDateInput(chip.date) : S.noDate}
            </span>
            <span className="sr-only">{state}</span>
          </>
        );
        return (
          <li
            key={chip.id}
            title={state}
            data-testid={`wbs-milestone-chip-${chip.id}`}
            data-reached={chip.reached}
            className={`${onSelect ? "" : CHIP} rounded-full border bg-surface text-xs font-semibold text-ink print:[print-color-adjust:exact] ${
              selectedId === chip.id ? "border-coral ring-2 ring-coral" : "border-line"
            }`}
          >
            {onSelect ? (
              <button
                type="button"
                aria-pressed={selectedId === chip.id}
                className={`${CHIP} cursor-pointer rounded-full hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-focus`}
                onClick={() => onSelect(chip.id)}
              >
                {body}
              </button>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
