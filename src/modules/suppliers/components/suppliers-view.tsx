"use client";

import { Badge } from "@/components/ui/badge";
import { dateColumn, listColumn, textColumn } from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";

import { rowAllows } from "@/lib/auth/actor-access";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { formatDate } from "@/lib/format";

import { createSupplierAction, updateSupplierAction } from "../actions";
import type { SupplierListRow, SupplierRow } from "../schemas/supplier";
import { supplierFormValues } from "../schemas/supplier-form";

import { SuppliersToolbar } from "./suppliers-toolbar";

export function contractRange(row: {
  ContractStartDate: Date | null;
  ContractEndDate: Date | null;
}): string {
  const start = formatDate(row.ContractStartDate);
  const end = formatDate(row.ContractEndDate);
  if (!start && !end) return "";
  return `${start || "—"} → ${end || "—"}`;
}

type Row = SupplierListRow;
const P = messages.suppliers.placeholders;

const columns: DataViewColumn<Row>[] = [
  textColumn({
    key: "SupplierName",
    header: messages.suppliers.supplierName,
    priority: 1,
    field: "supplierName",
    value: (r) => r.SupplierName,
    placeholder: P.supplierName,
    maxLength: 255,
  }),
  dateColumn({
    key: "ContractEndDate",
    header: messages.suppliers.contractEndDate,
    priority: 1,
    field: "contractEndDate",
    value: (r) => r.ContractEndDate,
    placeholder: P.contractEndDate,
  }),
  textColumn({
    key: "ContactPerson",
    header: messages.suppliers.contactPerson,
    priority: 2,
    field: "contactPerson",
    value: (r) => r.ContactPerson,
    placeholder: P.contactPerson,
    maxLength: 255,
  }),
  listColumn({
    key: "Rating",
    header: messages.suppliers.rating,
    priority: 2,
    field: "rating",
    list: "supplier.rating",
    value: (r) => r.Rating,
    placeholder: P.rating,
  }),
  textColumn({
    key: "City",
    header: messages.suppliers.city,
    priority: 3,
    field: "city",
    value: (r) => r.City,
    placeholder: P.city,
    maxLength: 255,
  }),
  textColumn({
    key: "EmailAddress",
    header: messages.suppliers.emailAddress,
    priority: 3,
    field: "emailAddress",
    value: (r) => r.EmailAddress,
    placeholder: P.emailAddress,
    maxLength: 255,
  }),
];

/** Datasheet edits go through the same update action as the Sheet (ADR-0023). */
const saveCell = formCellSaver<Row, SupplierRow>(supplierFormValues, updateSupplierAction);
const canEditRow = rowAllows("suppliers:update");

/**
 * Suppliers list (module #7): DataView; opening a row syncs ?id=. List view is
 * a datasheet (ADR-0023): editable cells and a new-entry row.
 */
export function SuppliersView({
  rows,
  totalCount,
  page,
  initialView,
  layout,
  filtersActive,
  projectId,
  canCreate,
  newSupplierAction,
}: {
  rows: SupplierListRow[];
  projectId: number;
  /** Shows the datasheet's new-entry row. */
  canCreate: boolean;
  totalCount: number;
  page: number;
  initialView: ViewMode;
  /** The user's saved datasheet layout (DataView initialLayout). */
  layout?: ListLayout | null;
  filtersActive: boolean;
  newSupplierAction?: React.ReactNode;
}) {
  const { update } = useListUrlState();

  return (
    <DataView
      moduleKey="suppliers"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      initialLayout={layout}
      getRowId={(row) => row.SupplierId}
      getRowLabel={(row) => row.SupplierName}
      onOpen={(row) => update({ id: String(row.SupplierId) })}
      renderCard={(row) => (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">{row.SupplierName}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge value={row.Rating} />
          </div>
          {row.ContactPerson ? <p className="text-xs text-ink-muted">{row.ContactPerson}</p> : null}
          {contractRange(row) ? (
            <p className="text-xs text-ink-muted">{contractRange(row)}</p>
          ) : null}
        </div>
      )}
      columns={columns}
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate
          ? { add: (values) => createSupplierAction({ ...values, projectId: String(projectId) }) }
          : undefined,
      }}
      renderToolbar={(viewToggle) => <SuppliersToolbar>{viewToggle}</SuppliersToolbar>}
      empty={listEmptyState(filtersActive, messages.suppliers.emptyBody, newSupplierAction)}
    />
  );
}
