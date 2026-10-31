"use client";

import { TONES } from "@/components/ui/tones";
import { messages } from "@/lib/messages";
import { MOSCOW_TONES, TYPE_TONES } from "@/modules/requirements/components/requirement-chips";
import { moscowLabel } from "@/modules/requirements/schemas/moscow";
import { typeLabel } from "@/modules/requirements/schemas/requirement-types";
import {
  MOSCOW_CHIPS,
  NO_FILTER,
  TYPE_CHIPS,
  isFiltering,
  toggleMoscowChip,
  toggleTypeChip,
  type MoscowChip,
  type RequirementCounts,
  type WbsFilter,
} from "../schemas/wbs-filter";

const W = messages.keyDeliverables.wbs;

const chip =
  "inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-center rounded-full border px-2 text-xs font-semibold";

function chipTone(on: boolean, tone: keyof typeof TONES | null) {
  if (!on) return "border-line text-ink-faint line-through hover:bg-surface-raised";
  return tone ? TONES[tone].badge : "border-line bg-surface-sunken text-ink-muted";
}

const moscowName = (code: MoscowChip) => (code === "none" ? W.filter.none : moscowLabel(code));

/**
 * The type and MoSCoW chips (pressed = shown). With counts, each chip says how many it covers and
 * a chip that covers none is left out.
 */
export function RequirementChipGroups({
  filter,
  onChange,
  counts,
  testId,
}: {
  filter: WbsFilter;
  onChange: (filter: WbsFilter) => void;
  counts?: RequirementCounts;
  testId: string;
}) {
  const types = counts ? TYPE_CHIPS.filter((t) => counts.types.has(t)) : TYPE_CHIPS;
  const codes = counts ? MOSCOW_CHIPS.filter((c) => counts.moscow.has(c)) : MOSCOW_CHIPS;
  const tally = (n: number | undefined) =>
    n === undefined ? null : <span className="ml-1 font-normal tabular-nums">{n}</span>;
  return (
    <>
      <div role="group" aria-label={W.filter.types} className="flex flex-wrap gap-1">
        {types.map((type) => {
          const on = !filter.hiddenTypes.has(type);
          return (
            <button
              key={type}
              type="button"
              aria-pressed={on}
              title={typeLabel(type)}
              data-testid={`${testId}-${type}`}
              onClick={() => onChange(toggleTypeChip(filter, type))}
              className={`${chip} ${chipTone(on, TYPE_TONES[type])}`}
            >
              {type}
              {tally(counts?.types.get(type))}
            </button>
          );
        })}
      </div>
      <div role="group" aria-label={W.filter.moscow} className="flex flex-wrap gap-1">
        {codes.map((code) => {
          const on = !filter.hiddenMoscow.has(code);
          const count = counts?.moscow.get(code);
          const name = count === undefined ? moscowName(code) : `${moscowName(code)} ${count}`;
          return (
            <button
              key={code}
              type="button"
              aria-pressed={on}
              aria-label={name}
              title={name}
              data-testid={`${testId}-moscow-${code}`}
              onClick={() => onChange(toggleMoscowChip(filter, code))}
              className={`${chip} ${chipTone(on, code === "none" ? null : MOSCOW_TONES[code])}`}
            >
              {code === "none" ? "–" : code}
              {tally(count)}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Search plus type and MoSCoW chips over the breakdown (pressed = shown). */
export function WbsFilterBar({
  filter,
  onChange,
  noMatch,
}: {
  filter: WbsFilter;
  onChange: (filter: WbsFilter) => void;
  /** The filter leaves no item on the chart. */
  noMatch: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="wbs-filter">
      <input
        type="search"
        value={filter.text}
        aria-label={W.filter.search}
        placeholder={W.filter.search}
        data-testid="wbs-search"
        onChange={(event) => onChange({ ...filter, text: event.target.value })}
        className="h-8 w-52 max-w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
      />
      <RequirementChipGroups filter={filter} onChange={onChange} testId="wbs-chip" />
      {isFiltering(filter) ? (
        <button
          type="button"
          data-testid="wbs-filter-clear"
          onClick={() => onChange(NO_FILTER)}
          className="min-h-8 cursor-pointer rounded-md px-2 text-sm font-medium text-ink-muted hover:bg-surface-raised hover:text-ink"
        >
          {W.filter.clear}
        </button>
      ) : null}
      <span role="status" data-testid="wbs-no-match" className="text-sm text-ink-muted">
        {noMatch ? W.filter.noMatch : ""}
      </span>
    </div>
  );
}
