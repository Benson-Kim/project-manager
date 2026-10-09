"use client";

import { booleanColumn, textColumn } from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { createParkingLotItemAction, updateParkingLotItemAction } from "../actions";
import type { ParkingLotItemListRow, ParkingLotItemRow } from "../schemas/parking-lot-item";
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
  booleanColumn({
    key: "IsStrikethrough",
    header: messages.parkingLot.strikethrough,
    priority: 2,
    field: "isStrikethrough",
    value: (r) => r.IsStrikethrough,
    yes: messages.parkingLot.resolved,
    no: messages.parkingLot.active,
    placeholder: P.strikethrough,
    render: (r) =>
      r.IsStrikethrough ? (
        <span className="text-sm text-ink-muted">{messages.parkingLot.resolved}</span>
      ) : (
        <span className="text-sm text-ink">{messages.parkingLot.active}</span>
      ),
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
 * Card: item text (struck through when resolved), resolved badge.
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
          {row.IsStrikethrough ? (
            <span className="text-xs text-ink-muted">{messages.parkingLot.resolved}</span>
          ) : null}
        </div>
      )}
      columns={columns}
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
