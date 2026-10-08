"use client";

import { Badge } from "@/components/ui/badge";
import { DataView } from "@/components/ui/data-view/data-view";
import { listColumn, textColumn } from "@/components/ui/data-view/columns";
import { formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";

import { rowAllows } from "@/lib/auth/actor-access";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";

import { createStakeholderAction, updateStakeholderAction } from "../actions";
import type { StakeholderListRow, StakeholderRow } from "../schemas/stakeholder";
import { stakeholderFormValues } from "../schemas/stakeholder-form";

import { StakeholdersToolbar } from "./stakeholders-toolbar";

export function fullName(row: { FirstName: string; LastName: string | null }): string {
  return [row.FirstName, row.LastName].filter(Boolean).join(" ");
}

type Row = StakeholderListRow;
const P = messages.stakeholders.placeholders;

const columns: DataViewColumn<Row>[] = [
  textColumn({
    key: "FirstName",
    header: messages.stakeholders.firstName,
    priority: 1,
    field: "firstName",
    value: (r) => r.FirstName,
    placeholder: P.firstName,
    maxLength: 255,
  }),
  textColumn({
    key: "LastName",
    header: messages.stakeholders.lastName,
    priority: 1,
    field: "lastName",
    value: (r) => r.LastName,
    placeholder: P.lastName,
    maxLength: 255,
  }),
  textColumn({
    key: "ProjectRole",
    header: messages.stakeholders.projectRole,
    priority: 1,
    field: "projectRole",
    value: (r) => r.ProjectRole,
    placeholder: P.projectRole,
    maxLength: 255,
    render: (r) => <Badge value={r.ProjectRole} />,
  }),
  listColumn({
    key: "EngagementLevel",
    header: messages.stakeholders.engagementLevel,
    priority: 2,
    field: "engagementLevel",
    list: "stakeholder.engagement-level",
    value: (r) => r.EngagementLevel,
    placeholder: P.engagementLevel,
  }),
  listColumn({
    key: "CommunicationPreference",
    header: messages.stakeholders.communicationPreference,
    priority: 3,
    field: "communicationPreference",
    list: "stakeholder.communication-preference",
    value: (r) => r.CommunicationPreference,
    placeholder: P.communicationPreference,
    render: (r) => r.CommunicationPreference,
  }),
  textColumn({
    key: "DepartmentOrganization",
    header: messages.stakeholders.departmentOrganization,
    priority: 2,
    field: "departmentOrganization",
    value: (r) => r.DepartmentOrganization,
    placeholder: P.departmentOrganization,
    maxLength: 255,
  }),
  textColumn({
    key: "EmailAddress",
    header: messages.stakeholders.emailAddress,
    priority: 3,
    field: "emailAddress",
    value: (r) => r.EmailAddress,
    placeholder: P.emailAddress,
    maxLength: 255,
  }),
  textColumn({
    key: "PhoneNumber",
    header: messages.stakeholders.phoneNumber,
    priority: 3,
    field: "phoneNumber",
    value: (r) => r.PhoneNumber,
    placeholder: P.phoneNumber,
    maxLength: 255,
  }),
];

/** Datasheet edits go through the same update action as the Sheet (ADR-0023). */
const saveCell = formCellSaver<Row, StakeholderRow>(stakeholderFormValues, updateStakeholderAction);
const canEditRow = rowAllows("stakeholders:update");

/**
 * Stakeholders list (module #6): DataView; opening a row syncs ?id= (sheet).
 * List view is a datasheet (ADR-0023): editable cells and a new-entry row.
 */
export function StakeholdersView({
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  projectId,
  canCreate,
  newStakeholderAction,
}: {
  rows: StakeholderListRow[];
  projectId: number;
  /** Shows the datasheet's new-entry row. */
  canCreate: boolean;
  totalCount: number;
  page: number;
  initialView: ViewMode;
  filtersActive: boolean;
  newStakeholderAction?: React.ReactNode;
}) {
  const { update, searchParams } = useListUrlState();

  return (
    <DataView
      moduleKey="stakeholders"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      getRowId={(row) => row.StakeholderId}
      getRowLabel={(row) => fullName(row)}
      onOpen={(row) =>
        update({ id: String(row.StakeholderId), page: searchParams.get("page") ?? null })
      }
      renderToolbar={(viewToggle) => <StakeholdersToolbar>{viewToggle}</StakeholdersToolbar>}
      renderCard={(row) => (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">{fullName(row)}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge value={row.ProjectRole} />
            <Badge value={row.EngagementLevel} />
          </div>
          {row.DepartmentOrganization ? (
            <p className="text-xs text-ink-muted">{row.DepartmentOrganization}</p>
          ) : null}
          {row.EmailAddress ? <p className="text-xs text-ink-muted">{row.EmailAddress}</p> : null}
        </div>
      )}
      columns={columns}
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate
          ? {
              add: (values) => createStakeholderAction({ ...values, projectId: String(projectId) }),
            }
          : undefined,
      }}
      empty={listEmptyState(filtersActive, messages.stakeholders.emptyBody, newStakeholderAction)}
    />
  );
}
