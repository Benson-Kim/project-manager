import { toCsv, type CsvCell } from "@/lib/csv";
import { toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import {
  itemProgress,
  requirementOutline,
  requirementsProgress,
  rolledBudget,
  rolledEffort,
  type Wbs,
  type WbsRequirement,
} from "../schemas/wbs";

const C = messages.keyDeliverables.wbs.csv;

/**
 * The work breakdown as CSV for "Copy CSV": every item in breakdown order, each followed by the
 * requirements allocated to it, depth first by their own tree. Progress, effort and budget come
 * from the plan rules (itemProgress, rolledEffort, rolledBudget), dates are YYYY-MM-DD, and toCsv
 * quotes and defuses spreadsheet formulas.
 */
export function wbsCsv(wbs: Wbs): string {
  const progress = itemProgress(wbs);
  const effort = rolledEffort(wbs);
  const budgets = rolledBudget(wbs);
  const rows: CsvCell[][] = [[...C.headers]];
  for (const id of wbs.order) {
    const { item, code, start, end } = wbs.nodes.get(id)!;
    const budget = budgets.get(id) ?? null;
    rows.push([
      code,
      item.name,
      item.isMilestone ? C.milestone : C.item,
      null,
      item.assignees.map((a) => a.name).join("; ") || item.assigneeNames,
      decimal(effort.get(id) ?? null, 1),
      toDateInput(start),
      toDateInput(end),
      Math.round(progress.get(id) ?? 0),
      decimal(budget, 2),
    ]);
    for (const { requirement } of requirementOutline(item.requirements)) {
      rows.push([
        requirement.ref,
        requirement.text,
        requirement.type,
        requirement.moscow,
        requirement.ownerName,
        decimal(requirement.estimateDays, 1),
        null,
        null,
        Math.round(requirementsProgress(subtree(item.requirements, requirement.id)) ?? 0),
        null,
      ]);
    }
  }
  return toCsv(rows);
}

function decimal(value: number | null, places: number): CsvCell {
  return value === null ? null : { number: value.toFixed(places) };
}

/** One requirement and everything under it, so requirementsProgress reads it as the only top. */
function subtree(requirements: readonly WbsRequirement[], id: number): WbsRequirement[] {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of requirements) {
      if (r.parentId !== null && ids.has(r.parentId) && !ids.has(r.id)) {
        ids.add(r.id);
        grew = true;
      }
    }
  }
  return requirements.filter((r) => ids.has(r.id));
}
