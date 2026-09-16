"use client";

import { DataView } from "@/components/ui/data-view/data-view";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Sheet } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/states";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import type { StakeholderOption } from "../repository/stakeholder-options";
import {
  isOverdue,
  type KeyDeliverableListRow,
  type KeyDeliverableRow,
} from "../schemas/key-deliverable";
import { Badge, OverdueBadge } from "./badges";
import { DeliverableForm } from "./deliverable-form";

/** Fixed locale so server and client render identical dates (no hydration drift). */
export function formatDate(value: Date | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(value);
}

function rowLabel(row: { KeyRequirement: string | null; KeyDeliverableId: number }): string {
  return row.KeyRequirement ?? messages.keyDeliverables.deliverableFallback(row.KeyDeliverableId);
}

type Row = KeyDeliverableListRow & { AssigneeName: string | null };

function StatusCell({ row }: { row: Row }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <Badge value={row.Status} />
      {isOverdue(row.Deadline, row.Status) ? <OverdueBadge /> : null}
    </span>
  );
}

const columns: DataViewColumn<Row>[] = [
  {
    key: "KeyRequirement",
    header: messages.keyDeliverables.requirement,
    priority: 1,
    render: (r) => <span className="line-clamp-2">{rowLabel(r)}</span>,
  },
  {
    key: "Deadline",
    header: messages.keyDeliverables.deadline,
    priority: 1,
    render: (r) => formatDate(r.Deadline),
  },
  {
    key: "Status",
    header: messages.keyDeliverables.status,
    priority: 2,
    render: (r) => <StatusCell row={r} />,
  },
  {
    key: "Priority",
    header: messages.keyDeliverables.priority,
    priority: 2,
    render: (r) => <Badge value={r.Priority} />,
  },
  {
    key: "AssignedTo",
    header: messages.keyDeliverables.assignedTo,
    priority: 3,
    render: (r) => r.AssigneeName ?? "",
  },
];

/**
 * Deliverables list (module #9): DataView grid + list with a URL-synced Sheet
 * (?d=new | ?d=<id>) for detail/edit — deep-linkable per ADR-0006/0010.
 */
export function DeliverablesView({
  projectId,
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  openDeliverable,
  sheetOpen,
  assigneeOptions,
  assigneeNames,
  canEdit,
  canDelete,
  newAction,
}: {
  projectId: number;
  rows: KeyDeliverableListRow[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
  filtersActive: boolean;
  /** Record resolved server-side from ?d=<id>; undefined for ?d=new. */
  openDeliverable?: KeyDeliverableRow;
  sheetOpen: boolean;
  assigneeOptions: StakeholderOption[];
  assigneeNames: Record<number, string>;
  canEdit: boolean;
  canDelete: boolean;
  newAction?: React.ReactNode;
}) {
  const { update } = useListUrlState();
  const close = () => update({ d: null });

  const withNames: Row[] = rows.map((r) => ({
    ...r,
    AssigneeName: r.AssignedToStakeholderId
      ? (assigneeNames[r.AssignedToStakeholderId] ?? null)
      : null,
  }));

  return (
    <>
      <DataView
        moduleKey="key-deliverables"
        rows={withNames}
        totalCount={totalCount}
        page={page}
        initialView={initialView}
        getRowId={(row) => row.KeyDeliverableId}
        getRowLabel={rowLabel}
        onOpen={(row) => update({ d: String(row.KeyDeliverableId) })}
        renderCard={(row) => (
          <div className="flex flex-col gap-2">
            <p className="line-clamp-2 text-sm font-semibold text-ink">{rowLabel(row)}</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge value={row.Status} />
              <Badge value={row.Priority} />
              {isOverdue(row.Deadline, row.Status) ? <OverdueBadge /> : null}
            </div>
            {row.Deadline ? (
              <p className="text-xs text-ink-muted">{formatDate(row.Deadline)}</p>
            ) : null}
            {row.AssigneeName ? <p className="text-xs text-ink-muted">{row.AssigneeName}</p> : null}
          </div>
        )}
        columns={columns}
        empty={
          filtersActive ? (
            <EmptyState
              title={messages.list.zeroResultsTitle}
              body={messages.list.zeroResultsBody}
            />
          ) : (
            <EmptyState
              title={messages.list.emptyTitle}
              body={messages.keyDeliverables.emptyBody}
              action={newAction}
            />
          )
        }
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
