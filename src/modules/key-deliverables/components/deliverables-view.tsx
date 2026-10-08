"use client";

import { useCallback, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/dialog";
import { DataView } from "@/components/ui/data-view/data-view";
import {
  DropdownListConfigProvider,
  makeDropdownRenderEdit,
  makeDropdownRenderInput,
} from "@/components/ui/data-view/dropdown-list-config";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";

import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import type { ViewMode } from "@/lib/list-params";

import { createKeyDeliverableAction } from "../actions";
import type { StakeholderOption } from "../repository/stakeholder-options";
import {
  DELIVERABLE_PRIORITIES,
  DELIVERABLE_STATUSES,
  isOverdue,
  type KeyDeliverableListRow,
  type KeyDeliverableRow,
} from "../schemas/key-deliverable";

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
      {isOverdue(row.Deadline, row.Status) ? <Badge value={messages.keyDeliverables.overdue} /> : null}
    </span>
  );
}

function buildColumns(canEdit: boolean): DataViewColumn<Row>[] {
  return [
    {
      key: "KeyRequirement",
      header: messages.keyDeliverables.requirement,
      priority: 1,
      render: (r) => <span className="line-clamp-2">{rowLabel(r)}</span>,
      // Add-row ghost input — plain text for the requirement field.
      renderInput: canEdit
        ? ({ value, onChange, onKeyDown }) => (
            <input
              type="text"
              value={value}
              placeholder={messages.keyDeliverables.requirementPlaceholder}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              className="h-full min-h-0 w-full border-0 bg-transparent px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            />
          )
        : undefined,
    },
    {
      key: "Deadline",
      header: messages.keyDeliverables.deadline,
      priority: 1,
      render: (r) => formatDate(r.Deadline),
      // Date picker for the add-row.
      renderInput: canEdit
        ? ({ value, onChange, onKeyDown }) => (
            <input
              type="date"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              className="h-full min-h-0 w-full border-0 bg-transparent px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            />
          )
        : undefined,
    },
    {
      key: "Status",
      header: messages.keyDeliverables.status,
      priority: 2,
      dropdownKey: "deliverable-status",
      render: (r) => <StatusCell row={r} />,
      editable: canEdit,
      renderEdit: canEdit ? makeDropdownRenderEdit((r: Row) => r.Status ?? "") : undefined,
      // Add-row: live select populated from DropdownListConfigContext.
      renderInput: canEdit
        ? makeDropdownRenderInput(messages.keyDeliverables.statusPlaceholder)
        : undefined,
    },
    {
      key: "Priority",
      header: messages.keyDeliverables.priority,
      priority: 2,
      dropdownKey: "deliverable-priority",
      render: (r) => <Badge value={r.Priority} />,
      editable: canEdit,
      renderEdit: canEdit ? makeDropdownRenderEdit((r: Row) => r.Priority ?? "") : undefined,
      // Add-row: live select populated from DropdownListConfigContext.
      renderInput: canEdit
        ? makeDropdownRenderInput(messages.keyDeliverables.priorityPlaceholder)
        : undefined,
    },
    {
      key: "AssignedTo",
      header: messages.keyDeliverables.assignees,
      priority: 3,
      render: (r) => r.AssigneeNames ?? "",
      // Assignees are multi-select — not inline-addable in the guide row.
      // The full Sheet form handles them.
    },
  ];
}

/** Default option lists seeded from the schema constants. */
const DELIVERABLES_DROPDOWN_DEFAULTS = {
  "deliverable-status": [...DELIVERABLE_STATUSES],
  "deliverable-priority": [...DELIVERABLE_PRIORITIES],
};

/**
 * Deliverables list (module #9): DataView grid + list with a URL-synced Sheet
 * (?d=new | ?d=<id>) for detail/edit — deep-linkable.
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
  canEdit: boolean;
  canDelete: boolean;
  newAction?: React.ReactNode;
}) {
  const { update } = useListUrlState();
  const close = () => update({ d: null });

  // Memoize columns: buildColumns is pure and only depends on canEdit, so this
  // is stable across re-renders. Without this, InlineAddRow's draft state would
  // reset on every parent re-render because a new columns array identity causes
  // the component to remount.
  const columns = useMemo(() => buildColumns(canEdit), [canEdit]);

  // Inline add-row handler: maps draft keys (column keys) → action input.
  const handleAddRow = useCallback(
    async (draft: Record<string, string>) => {
      const result = await createKeyDeliverableAction({
        projectId,
        keyRequirement: draft.KeyRequirement ?? "",
        deadline: draft.Deadline || undefined,
        status: (draft.Status as (typeof DELIVERABLE_STATUSES)[number]) || undefined,
        priority: (draft.Priority as (typeof DELIVERABLE_PRIORITIES)[number]) || undefined,
      });
      if (result.ok) return { ok: true as const };
      return { ok: false as const, error: { message: result.error.message } };
    },
    [projectId],
  );

  return (
    <DropdownListConfigProvider moduleKey="key-deliverables" defaults={DELIVERABLES_DROPDOWN_DEFAULTS}>
      <DataView
        moduleKey="key-deliverables"
        rows={rows}
        totalCount={totalCount}
        page={page}
        initialView={initialView}
        getRowId={(row) => row.KeyDeliverableId}
        getRowLabel={rowLabel}
        onOpen={(row) => update({ d: String(row.KeyDeliverableId) })}
        renderToolbar={(viewToggle) => (
          <DeliverablesToolbar>{viewToggle}</DeliverablesToolbar>
        )}
        renderCard={(row) => (
          <div className="flex flex-col gap-2">
            <p className="line-clamp-2 text-sm font-semibold text-ink">{rowLabel(row)}</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge value={row.Status} />
              <Badge value={row.Priority} />
              {isOverdue(row.Deadline, row.Status) ? <Badge value={messages.keyDeliverables.overdue} /> : null}
            </div>
            {row.Deadline ? (
              <p className="text-xs text-ink-muted">{formatDate(row.Deadline)}</p>
            ) : null}
            {row.AssigneeNames ? <p className="text-xs text-ink-muted">{row.AssigneeNames}</p> : null}
          </div>
        )}
        columns={columns}
        empty={listEmptyState(filtersActive, messages.keyDeliverables.emptyBody, newAction)}
        addRow={
          canEdit
            ? { onAdd: handleAddRow, addLabel: messages.keyDeliverables.addDeliverable }
            : undefined
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
    </DropdownListConfigProvider>
  );
}
