"use client";

import { DataView } from "@/components/ui/data-view/data-view";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import type { ParkingLotItemListRow } from "../schemas/parking-lot-item";
import { ParkingLotToolbar } from "./parking-lot-toolbar";

const columns: DataViewColumn<ParkingLotItemListRow>[] = [
  {
    key: "ParkingLotItem",
    header: messages.parkingLot.item,
    priority: 1,
    render: (r) => (
      <span
        aria-label={
          r.IsStrikethrough
            ? `${r.ParkingLotItem ?? messages.app.untitled}, ${messages.parkingLot.resolved}`
            : (r.ParkingLotItem ?? messages.app.untitled)
        }
        className={r.IsStrikethrough ? "line-through text-ink-muted" : undefined}
      >
        {r.ParkingLotItem}
      </span>
    ),
  },
  {
    key: "IsStrikethrough",
    header: messages.parkingLot.strikethrough,
    priority: 2,
    render: (r) =>
      r.IsStrikethrough ? (
        <span className="text-sm text-ink-muted">{messages.parkingLot.resolved}</span>
      ) : (
        <span className="text-sm text-ink">{messages.parkingLot.active}</span>
      ),
  },
];

/**
 * Parking lot list (module #18): DataView grid + list; opening a row syncs ?id= (Sheet).
 * Card: item text (struck through when resolved), resolved badge.
 */
export function ParkingLotView({
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  newItemAction,
}: {
  rows: ParkingLotItemListRow[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
  filtersActive: boolean;
  newItemAction?: React.ReactNode;
}) {
  const { update, searchParams } = useListUrlState();

  return (
    <DataView
      moduleKey="parking-lot"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      getRowId={(row) => row.ParkingLotItemId}
      getRowLabel={(row) => row.ParkingLotItem ?? messages.app.untitled}
      filtersActive={filtersActive}
      onOpen={(row) =>
        update({ id: String(row.ParkingLotItemId), page: searchParams.get("page") ?? null })
      }
      renderCard={(row) => (
        <div className="flex flex-col gap-1.5">
          <p
            aria-label={
              row.IsStrikethrough
                ? `${row.ParkingLotItem ?? messages.app.untitled}, ${messages.parkingLot.resolved}`
                : (row.ParkingLotItem ?? messages.app.untitled)
            }
            className={[
              "line-clamp-2 text-sm font-semibold",
              row.IsStrikethrough ? "line-through text-ink-muted" : "text-ink",
            ].join(" ")}
          >
            {row.ParkingLotItem ?? messages.app.untitled}
          </p>
          {row.IsStrikethrough ? (
            <span className="text-xs text-ink-muted">{messages.parkingLot.resolved}</span>
          ) : null}
        </div>
      )}
      columns={columns}
      renderToolbar={(viewToggle) => (
        <ParkingLotToolbar>{viewToggle}</ParkingLotToolbar>
      )}
      empty={listEmptyState(filtersActive, messages.parkingLot.emptyBody, newItemAction)}
    />
  );
}
