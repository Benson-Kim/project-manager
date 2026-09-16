"use client";

import { DataView } from "@/components/ui/data-view/data-view";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { EmptyState } from "@/components/ui/states";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import type { StakeholderListRow } from "../schemas/stakeholder";

export function fullName(row: { FirstName: string; LastName: string | null }): string {
  return [row.FirstName, row.LastName].filter(Boolean).join(" ");
}

function Badge({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink">
      {value}
    </span>
  );
}

const columns: DataViewColumn<StakeholderListRow>[] = [
  { key: "Name", header: messages.stakeholders.name, priority: 1, render: (r) => fullName(r) },
  {
    key: "ProjectRole",
    header: messages.stakeholders.projectRole,
    priority: 1,
    render: (r) => <Badge value={r.ProjectRole} />,
  },
  {
    key: "EngagementLevel",
    header: messages.stakeholders.engagementLevel,
    priority: 2,
    render: (r) => <Badge value={r.EngagementLevel} />,
  },
  {
    key: "DepartmentOrganization",
    header: messages.stakeholders.departmentOrganization,
    priority: 2,
    render: (r) => r.DepartmentOrganization,
  },
  {
    key: "EmailAddress",
    header: messages.stakeholders.emailAddress,
    priority: 3,
    render: (r) => r.EmailAddress,
  },
  {
    key: "PhoneNumber",
    header: messages.stakeholders.phoneNumber,
    priority: 3,
    render: (r) => r.PhoneNumber,
  },
];

/** Stakeholders list (module #6): DataView; opening a row syncs ?id= (ADR-0010 sheet). */
export function StakeholdersView({
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  newStakeholderAction,
}: {
  rows: StakeholderListRow[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
  filtersActive: boolean;
  newStakeholderAction?: React.ReactNode;
}) {
  const { update } = useListUrlState();

  return (
    <DataView
      moduleKey="stakeholders"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      getRowId={(row) => row.StakeholderId}
      onOpen={(row) => update({ id: String(row.StakeholderId) })}
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
      empty={
        filtersActive ? (
          <EmptyState title={messages.list.zeroResultsTitle} body={messages.list.zeroResultsBody} />
        ) : (
          <EmptyState
            title={messages.list.emptyTitle}
            body={messages.stakeholders.emptyBody}
            action={newStakeholderAction}
          />
        )
      }
    />
  );
}
