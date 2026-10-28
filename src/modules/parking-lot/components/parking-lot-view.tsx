"use client";

import { listColumn, textColumn } from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { ListBadge } from "@/components/ui/lookup-lists";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { createParkingLotItemAction, updateParkingLotItemAction } from "../actions";
import {
  PARKING_LOT_SORT,
  PARKING_LOT_STATUS,
  type ParkingLotItemListRow,
  type ParkingLotItemRow,
} from "../schemas/parking-lot-item";
import { parkingLotItemFormValues } from "../schemas/parking-lot-item-form";
import { ParkingLotToolbar } from "./parking-lot-toolbar";

type Row = ParkingLotItemListRow;
const P = messages.parkingLot.placeholders;

const columns: DataViewColumn<Row>[] = [
  textColumn({
    key: "ParkingLotItem",
    header: messages.parkingLot.item,
    priority: 1,
    field: "parkingLotItem",
    value: (r) => r.ParkingLotItem,
    placeholder: P.item,
    maxLength: 255,
    // A parking lot item is prose: it wraps in the sheet's textarea, so it
    // wraps in the cell too (client feedback 2026-10-26).
    multiline: true,
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
  }),
  textColumn({
    key: "Owner",
    header: messages.parkingLot.owner,
    priority: 2,
    field: "owner",
    value: (r) => r.Owner,
    placeholder: P.owner,
    maxLength: 255,
  }),
  // A managed list (migration 031): every item has a status, a new one starts Active.
  listColumn({
    key: "Status",
    header: messages.parkingLot.status,
    priority: 2,
    field: "status",
    list: "parking-lot-item.status",
    value: (r) => r.Status,
    placeholder: P.status,
    clearable: false,
    initial: PARKING_LOT_STATUS.active,
  }),
];

/** Datasheet edits go through the same update action as the Sheet (ADR-0023). */
const saveCell = formCellSaver<Row, ParkingLotItemRow>(
  parkingLotItemFormValues,
  updateParkingLotItemAction,
);
const canEditRow = rowAllows("parking-lot:update");

/**
 * Parking lot list (module #18): DataView grid + list; opening a row syncs ?id= (Sheet).
 * Card: item text (struck through when resolved), status badge.
 */
export function ParkingLotView({
  rows,
  totalCount,
  page,
  initialView,
  layout,
  filtersActive,
  projectId,
  canCreate,
  newItemAction,
}: {
  rows: ParkingLotItemListRow[];
  projectId: number;
  /** Shows the datasheet's new-entry row. */
  canCreate: boolean;
  totalCount: number;
  page: number;
  initialView: ViewMode;
  /** The user's saved datasheet layout (DataView initialLayout). */
  layout?: ListLayout | null;
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
      initialLayout={layout}
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
          <ListBadge list="parking-lot-item.status" value={row.Status} />
        </div>
      )}
      columns={columns}
      sort={PARKING_LOT_SORT}
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate
          ? {
              add: (values) =>
                createParkingLotItemAction({ ...values, projectId: String(projectId) }),
            }
          : undefined,
      }}
      renderToolbar={(viewToggle) => <ParkingLotToolbar>{viewToggle}</ParkingLotToolbar>}
      empty={listEmptyState(filtersActive, messages.parkingLot.emptyBody, newItemAction)}
    />
  );
}
