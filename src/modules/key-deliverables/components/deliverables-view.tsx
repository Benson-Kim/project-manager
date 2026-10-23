"use client";

import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/dialog";
import { DataView } from "@/components/ui/data-view/data-view";
import { dateColumn, listColumn, textColumn } from "@/components/ui/data-view/columns";
import { formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";

import { rowAllows } from "@/lib/auth/actor-access";
import { formatDate, toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";

import { createKeyDeliverableAction, updateKeyDeliverableAction } from "../actions";
import type { StakeholderOption } from "@/modules/stakeholders/repository/stakeholder-options";
import {
  isOverdue,
  type KeyDeliverableListRow,
  type KeyDeliverableRow,
} from "../schemas/key-deliverable";
import { deliverableFormValues } from "../schemas/key-deliverable-form";
import { todayUtc } from "../schemas/wbs";

import { DeliverableForm } from "./deliverable-form";
import { DeliverablesToolbar } from "./deliverables-toolbar";

function rowLabel(row: { KeyRequirement: string | null; KeyDeliverableId: number }): string {
  return row.KeyRequirement ?? messages.keyDeliverables.deliverableFallback(row.KeyDeliverableId);
}

type Row = KeyDeliverableListRow;

function StatusCell({ row }: { row: Row }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <Badge value={row.Status} />
      {isOverdue(row.Deadline, row.Status) ? (
        <Badge value={messages.keyDeliverables.overdue} />
      ) : null}
    </span>
  );
}

const P = messages.keyDeliverables.placeholders;

const columns: DataViewColumn<Row>[] = [
  {
    key: "WbsCode",
    header: messages.keyDeliverables.wbsCode,
    priority: 1,
    render: (r) => <span className="tabular-nums">{r.WbsCode ?? ""}</span>,
  },
  textColumn({
    key: "KeyRequirement",
    header: messages.keyDeliverables.deliverable,
    priority: 1,
    field: "keyRequirement",
    value: (r) => r.KeyRequirement,
    placeholder: P.deliverable,
    maxLength: 4000,
    render: (r) => <span className="line-clamp-2">{rowLabel(r)}</span>,
  }),
  // A parent's dates come from its sub-items (ADR-0027): shown, never edited here.
  dateColumn({
    key: "StartDate",
    header: messages.keyDeliverables.startDate,
    priority: 2,
    field: "startDate",
    value: (r) => r.StartDate ?? null,
    placeholder: P.startDate,
    editable: (r) => !r.HasChildren,
  }),
  dateColumn({
    key: "Deadline",
    header: messages.keyDeliverables.deadline,
    priority: 1,
    field: "deadline",
    value: (r) => r.Deadline,
    placeholder: P.deadline,
    editable: (r) => !r.HasChildren,
  }),
  listColumn({
    key: "Status",
    header: messages.keyDeliverables.status,
    priority: 2,
    field: "status",
    list: "key-deliverable.status",
    value: (r) => r.Status,
    placeholder: P.status,
    render: (r) => <StatusCell row={r} />,
  }),
  listColumn({
    key: "Priority",
    header: messages.keyDeliverables.priority,
    priority: 2,
    field: "priority",
    list: "key-deliverable.priority",
    value: (r) => r.Priority,
    placeholder: P.priority,
  }),
  {
    key: "AssignedTo",
    header: messages.keyDeliverables.assignees,
    priority: 3,
    render: (r) => r.AssigneeNames ?? "",
  },
];

/** Datasheet edits go through the same update action as the Sheet (ADR-0023). */
const saveCell = formCellSaver<Row, KeyDeliverableRow>(
  deliverableFormValues,
  updateKeyDeliverableAction,
);
const canEditRow = rowAllows("key-deliverables:update");

/**
 * Deliverables list (module #9): DataView grid + list with a URL-synced Sheet
 * (?d=new | ?d=<id>) for detail/edit — deep-linkable. List view is a datasheet
 * (ADR-0023): editable cells per the row's access and a new-entry row.
 */
export function DeliverablesView({
  projectId,
  rows,
  totalCount,
  page,
  initialView,
  layout,
  filtersActive,
  openDeliverable,
  sheetOpen,
  assigneeOptions,
  canEdit,
  canCreate,
  canDelete,
  newAction,
}: {
  projectId: number;
  rows: KeyDeliverableListRow[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
  /** The user's saved datasheet layout (DataView initialLayout). */
  layout?: ListLayout | null;
  filtersActive: boolean;
  /** Record resolved server-side from ?d=<id>; undefined for ?d=new. */
  openDeliverable?: KeyDeliverableRow;
  sheetOpen: boolean;
  assigneeOptions: StakeholderOption[];
  canEdit: boolean;
  /** Shows the datasheet's new-entry row. */
  canCreate: boolean;
  canDelete: boolean;
  newAction?: React.ReactNode;
}) {
  const { update } = useListUrlState();
  const close = () => update({ d: null });

  return (
    <>
      <DataView
        moduleKey="key-deliverables"
        rows={rows}
        totalCount={totalCount}
        page={page}
        initialView={initialView}
        initialLayout={layout}
        getRowId={(row) => row.KeyDeliverableId}
        getRowLabel={rowLabel}
        onOpen={(row) => update({ d: String(row.KeyDeliverableId) })}
        renderToolbar={(viewToggle) => <DeliverablesToolbar>{viewToggle}</DeliverablesToolbar>}
        renderCard={(row) => (
          <div className="flex flex-col gap-2">
            <p className="line-clamp-2 text-sm font-semibold text-ink">
              {row.WbsCode ? <span className="mr-1.5 tabular-nums">{row.WbsCode}</span> : null}
              {rowLabel(row)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Badge value={row.Status} />
              <Badge value={row.Priority} />
              {isOverdue(row.Deadline, row.Status) ? (
                <Badge value={messages.keyDeliverables.overdue} />
              ) : null}
            </div>
            {row.StartDate || row.Deadline ? (
              <p className="text-xs text-ink-muted">
                {[formatDate(row.StartDate), formatDate(row.Deadline)].filter(Boolean).join(" – ")}
              </p>
            ) : null}
            {row.AssigneeNames ? (
              <p className="text-xs text-ink-muted">{row.AssigneeNames}</p>
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
                  createKeyDeliverableAction({
                    ...values,
                    startDate: values.startDate || toDateInput(todayUtc()),
                    projectId: String(projectId),
                  }),
              }
            : undefined,
        }}
        empty={listEmptyState(filtersActive, messages.keyDeliverables.emptyBody, newAction)}
      />
      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={
          openDeliverable
            ? messages.keyDeliverables.editTitle
            : messages.keyDeliverables.newDeliverable
        }
      >
        <DeliverableForm
          projectId={projectId}
          deliverable={openDeliverable}
          assigneeOptions={assigneeOptions}
          canEdit={canEdit}
          canDelete={canDelete}
          onDone={close}
        />
      </Sheet>
    </>
  );
}
