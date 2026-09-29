"use client";

import { Badge } from "@/components/ui/badge";
import { DataView } from "@/components/ui/data-view/data-view";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";

import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { formatDate } from "@/lib/format";

import type { SupplierListRow } from "../schemas/supplier";

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

const columns: DataViewColumn<SupplierListRow>[] = [
  {
    key: "SupplierName",
    header: messages.suppliers.supplierName,
    priority: 1,
    render: (r) => r.SupplierName,
  },
  {
    key: "ContractEndDate",
    header: messages.suppliers.contractEndDate,
    priority: 1,
    render: (r) => formatDate(r.ContractEndDate),
  },
  {
    key: "ContactPerson",
    header: messages.suppliers.contactPerson,
    priority: 2,
    render: (r) => r.ContactPerson,
  },
  {
    key: "Rating",
    header: messages.suppliers.rating,
    priority: 2,
    render: (r) => <Badge value={r.Rating} />,
  },
  { key: "City", header: messages.suppliers.city, priority: 3, render: (r) => r.City },
  {
    key: "EmailAddress",
    header: messages.suppliers.emailAddress,
    priority: 3,
    render: (r) => r.EmailAddress,
  },
];

/** Suppliers list (module #7): DataView; opening a row syncs ?id=. */
export function SuppliersView({
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  newSupplierAction,
}: {
  rows: SupplierListRow[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
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
      renderToolbar={(viewToggle) => (
        <SuppliersToolbar>{viewToggle}</SuppliersToolbar>
      )}
      empty={listEmptyState(filtersActive, messages.suppliers.emptyBody, newSupplierAction)}
    />
  );
}
