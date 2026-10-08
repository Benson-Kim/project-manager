"use client";

import { Badge } from "@/components/ui/badge";
import { DataView } from "@/components/ui/data-view/data-view";
import { DropdownListConfigProvider } from "@/components/ui/data-view/dropdown-list-config";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";

import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";

import {
  ENGAGEMENT_LEVELS,
  type StakeholderListRow,
} from "../schemas/stakeholder";

import { StakeholdersToolbar } from "./stakeholders-toolbar";

export function fullName(row: { FirstName: string; LastName: string | null }): string {
  return [row.FirstName, row.LastName].filter(Boolean).join(" ");
}

const columns: DataViewColumn<StakeholderListRow>[] = [
  { key: "Name", header: messages.stakeholders.name, priority: 1, render: (r) => fullName(r) },
  {
    key: "ProjectRole",
    header: messages.stakeholders.projectRole,
    priority: 1,
    dropdownKey: "stakeholder-project-role",
    render: (r) => <Badge value={r.ProjectRole} />,
    // renderEdit is intentionally omitted: inline editing requires onCellChange
    // to be wired through DataView, which in turn requires a server action for
    // partial-update of a single field. Until that action exists, showing a
    // "click to edit" affordance would be a dead-end UX.
  },
  {
    key: "EngagementLevel",
    header: messages.stakeholders.engagementLevel,
    priority: 2,
    dropdownKey: "stakeholder-engagement-level",
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

/** Default option lists seeded from the schema constants.
 *  CommunicationPreference is intentionally excluded: no column in the list
 *  view uses it (it lives in the detail Sheet only). */
const STAKEHOLDERS_DROPDOWN_DEFAULTS = {
  "stakeholder-project-role": ["Sponsor", "Manager", "Analyst", "Consultant", "End User", "Other"],
  "stakeholder-engagement-level": [...ENGAGEMENT_LEVELS],
};

/** Stakeholders list (module #6): DataView; opening a row syncs ?id=  sheet). */
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
  const { update, searchParams } = useListUrlState();

  return (
    <DropdownListConfigProvider moduleKey="stakeholders" defaults={STAKEHOLDERS_DROPDOWN_DEFAULTS}>
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
        renderToolbar={(viewToggle) => (
          <StakeholdersToolbar>{viewToggle}</StakeholdersToolbar>
        )}
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
        empty={listEmptyState(filtersActive, messages.stakeholders.emptyBody, newStakeholderAction)}
      />
    </DropdownListConfigProvider>
  );
}
