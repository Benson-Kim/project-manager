"use client";

import { useId, useState } from "react";
import { messages } from "@/lib/messages";
import type { RequirementOption } from "@/modules/requirements/schemas/requirement";
import type { SolutionType } from "@/modules/requirements/schemas/requirement-types";
import type { WbsNode } from "../schemas/wbs";
import {
  NO_FILTER,
  isFiltering,
  itemRequirementsShown,
  requirementCounts,
  type WbsFilter,
} from "../schemas/wbs-filter";
import { RequirementChipGroups } from "./wbs-filter-bar";
import {
  BoxRequirements,
  type RequirementAccess,
  type RequirementHandlers,
} from "./wbs-requirements";

const W = messages.keyDeliverables.wbs;
const B = W.board;

/**
 * The requirements of the card whose chip was pressed, under the Gantt: type and MoSCoW chips
 * with counts, then the list with its met ticks, MoSCoW, criteria, moves, removes and the add field.
 */
export function GanttRequirementsPanel({
  node,
  adding,
  addType,
  needs,
  access,
  on,
  onClose,
}: {
  node: WbsNode;
  adding: boolean;
  addType: SolutionType;
  needs: readonly RequirementOption[];
  access: RequirementAccess;
  on: RequirementHandlers;
  onClose(): void;
}) {
  const headingId = useId();
  const [filter, setFilter] = useState<WbsFilter>(NO_FILTER);
  const requirements = node.item.requirements;
  const only = itemRequirementsShown(node.item, filter) ?? undefined;
  const name = node.item.name || messages.keyDeliverables.deliverableFallback(node.item.id);
  const met = requirements.filter((r) => r.isMet).length;

  return (
    <section
      aria-labelledby={headingId}
      data-testid="gantt-requirements"
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 print:hidden"
    >
      <div className="flex items-center gap-2">
        <h2 id={headingId} className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          {B.requirementsTitle(node.code, name)}
        </h2>
        <span className="text-xs text-ink-muted tabular-nums">
          {W.requirementCount(met, requirements.length)}
        </span>
        <button
          type="button"
          aria-label={B.closeRequirements}
          title={B.closeRequirements}
          data-testid="gantt-requirements-close"
          onClick={onClose}
          className="flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-muted hover:bg-surface-raised hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </div>
      {requirements.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <RequirementChipGroups
            filter={filter}
            onChange={setFilter}
            counts={requirementCounts(requirements)}
            testId="gantt-req-chip"
          />
          {isFiltering(filter) ? (
            <button
              type="button"
              data-testid="gantt-req-chip-clear"
              onClick={() => setFilter(NO_FILTER)}
              className="min-h-8 cursor-pointer rounded-md px-2 text-sm font-medium text-ink-muted hover:bg-surface-raised hover:text-ink"
            >
              {W.filter.clear}
            </button>
          ) : null}
        </div>
      ) : null}
      <BoxRequirements
        node={node}
        hidden={false}
        adding={adding}
        addType={addType}
        needs={needs}
        access={access}
        on={on}
        only={only}
        alwaysOpen
      />
    </section>
  );
}
