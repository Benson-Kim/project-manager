import { describe, expect, it } from "vitest";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { dailyActivitySortNote } from "../components/sort-note";

type Row = Record<string, never>;

function column(key: string, header: string, sort?: string): DataViewColumn<Row> {
  return { key, header, priority: 1, render: () => null, sort };
}

const COLUMNS = [
  column("RequestDate", "Request date"),
  column("ActivityDate", "My date"),
  column("ActivityStatus", "Status", "Status"),
  column("CompleteDate", "Completed date"),
];

describe("the daily activities list says how it is ordered", () => {
  it("names the default order, newest request first", () => {
    expect(dailyActivitySortNote(COLUMNS, {})).toBe("Sorted by Request date, newest first");
  });

  it("follows the sort in the address, under the column's shown name", () => {
    expect(dailyActivitySortNote(COLUMNS, { sort: "ActivityDate", dir: "asc" })).toBe(
      "Sorted by My date, oldest first",
    );
  });

  it("matches a column by its sort key, and says no direction for a non-date column", () => {
    expect(dailyActivitySortNote(COLUMNS, { sort: "Status", dir: "asc" })).toBe("Sorted by Status");
  });

  it("falls back to the default order for a sort the list does not offer", () => {
    expect(dailyActivitySortNote(COLUMNS, { sort: "Requester", dir: "asc" })).toBe(
      "Sorted by Request date, oldest first",
    );
  });

  it("says nothing when the sorted column is hidden", () => {
    expect(dailyActivitySortNote(COLUMNS.slice(1), {})).toBeNull();
  });
});
