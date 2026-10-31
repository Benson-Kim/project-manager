import { toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import { itemProgress, type Wbs } from "../schemas/wbs";

const W = messages.keyDeliverables.wbs;

/**
 * The plan as plain text for "Copy summary": the project's name, then every item in breakdown
 * order, indented by level, with its progress, YYYY-MM-DD dates and priority. A milestone gives
 * its date instead.
 */
export function ganttSummary(projectName: string, wbs: Wbs): string {
  const progress = itemProgress(wbs);
  const lines = [projectName];
  for (const id of wbs.order) {
    const { item, code, depth, start, end } = wbs.nodes.get(id)!;
    const name = item.name || messages.keyDeliverables.deliverableFallback(id);
    const from = toDateInput(start);
    const to = toDateInput(end);
    const dates = !from || !to ? W.noDates : from === to ? from : `${from} – ${to}`;
    const facts = item.isMilestone
      ? [W.board.summaryMilestone(from || W.noDates)]
      : [`${Math.round(progress.get(id) ?? 0)}%`, dates, ...(item.priority ? [item.priority] : [])];
    lines.push(`${"  ".repeat(depth - 1)}${code} ${name}: ${facts.join(", ")}`);
  }
  return lines.join("\n");
}
