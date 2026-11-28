import { sortTokenOf } from "@/components/ui/data-view/sorting";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { resolveSort } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { DAILY_ACTIVITY_SORT } from "../schemas/daily-activity";

const DATED_SORTS: ReadonlySet<string> = new Set(["RequestDate", "ActivityDate", "CompleteDate"]);

/** How the list is ordered now, in the column's shown name, or null when no shown column matches. */
export function dailyActivitySortNote<Row>(
  columns: readonly DataViewColumn<Row>[],
  url: { sort?: string | null; dir?: string | null },
): string | null {
  const order = resolveSort(DAILY_ACTIVITY_SORT, url);
  const sortedBy = columns.find((c) => sortTokenOf(c) === order.sort);
  if (!sortedBy || !order.sort) return null;
  return messages.dailyActivities.sortNote(sortedBy.header, order.dir, DATED_SORTS.has(order.sort));
}
