"use client";

import {
  dateColumn,
  listColumn,
  richTextColumn,
  textColumn,
} from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { formCellSaver, richContent } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import type { WithRichViews } from "@/components/ui/rich-text/rich-views";
import { ListBadge } from "@/components/ui/lookup-lists";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import type { ListLayout } from "@/lib/list-layout";
import type { OptionColor } from "@/lib/lookup-lists";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { richTextToPlain } from "@/lib/rich-text/plain-text";
import { createRiskIssueAction, updateRiskIssueAction } from "../actions";
import {
  isClosed,
  RISK_ISSUE_CATEGORY,
  RISK_ISSUE_SORT,
  RISK_ISSUE_STATUS,
  type RiskIssueListRow,
  type RiskIssueRow,
} from "../schemas/risk-issue";
import { riskIssueFormValues } from "../schemas/risk-issue-form";
import { RiskIssueToolbar } from "./risk-issue-toolbar";

export type RiskIssueListItem = WithRichViews<RiskIssueListRow, "Description" | "MitigationPlan">;
type Row = RiskIssueListItem;
const P = messages.risksIssues.placeholders;

/** The record's own words, for a row label or a title; the field holds HTML (ADR-0025). */
export const riskIssueLabel = (row: { Description: string | null }) =>
  richTextToPlain(row.Description) || messages.app.untitled;

const columns: DataViewColumn<Row>[] = [
  richTextColumn({
    key: "Description",
    header: messages.risksIssues.description,
    priority: 1,
    field: "description",
    value: (r) => r.Description,
    placeholder: P.description,
    view: (r) => r.views.Description,
  }),
  // A new record is a Risk until someone says otherwise; both labels are locked (migration 049).
  listColumn({
    key: "Category",
    header: messages.risksIssues.category,
    priority: 1,
    field: "category",
    list: "risk-issue.category",
    value: (r) => r.Category,
    placeholder: P.category,
    initial: RISK_ISSUE_CATEGORY.risk,
  }),
  listColumn({
    key: "Status",
    header: messages.risksIssues.status,
    priority: 1,
    field: "status",
    list: "risk-issue.status",
    value: (r) => r.Status,
    placeholder: P.status,
    initial: RISK_ISSUE_STATUS.open,
  }),
  listColumn({
    key: "Priority",
    header: messages.risksIssues.priority,
    priority: 2,
    field: "priority",
    list: "risk-issue.priority",
    value: (r) => r.Priority,
    placeholder: P.priority,
  }),
  listColumn({
    key: "Impact",
    header: messages.risksIssues.impact,
    priority: 2,
    field: "impact",
    list: "risk-issue.impact",
    value: (r) => r.Impact,
    placeholder: P.impact,
  }),
  listColumn({
    key: "Probability",
    header: messages.risksIssues.probability,
    priority: 3,
    field: "probability",
    list: "risk-issue.probability",
    value: (r) => r.Probability,
    placeholder: P.probability,
  }),
  textColumn({
    key: "Owner",
    header: messages.risksIssues.owner,
    priority: 2,
    field: "owner",
    value: (r) => r.Owner,
    placeholder: P.owner,
    maxLength: 255,
  }),
  dateColumn({
    key: "DateIdentified",
    header: messages.risksIssues.dateIdentified,
    priority: 3,
    field: "dateIdentified",
    value: (r) => r.DateIdentified,
    placeholder: P.dateIdentified,
  }),
  dateColumn({
    key: "DueDate",
    header: messages.risksIssues.dueDate,
    priority: 2,
    field: "dueDate",
    value: (r) => r.DueDate,
    placeholder: P.dueDate,
  }),
  richTextColumn({
    key: "MitigationPlan",
    header: messages.risksIssues.mitigationPlan,
    priority: 3,
    field: "mitigationPlan",
    value: (r) => r.MitigationPlan,
    placeholder: P.mitigationPlan,
    view: (r) => r.views.MitigationPlan,
  }),
];

/** Datasheet edits go through the same update action as the Sheet (ADR-0023). */
const saveCell = formCellSaver<Row, RiskIssueRow>(riskIssueFormValues, updateRiskIssueAction);
const canEditRow = rowAllows("risks-issues:update");

/** A closed record is muted in the list as on its card (ADR-0050). */
const closedTone = (row: Row): OptionColor | null => (isClosed(row.Status) ? "gray" : null);

/**
 * Risks & issues register (module #14, ADR-0050): DataView grid + list;
 * opening a row syncs ?id= (Sheet). List view is a datasheet (ADR-0023):
 * editable cells and a new-entry row. A closed record is shown muted, the way a
 * resolved parking lot item is struck through.
 */
export function RisksIssuesView({
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
  rows: Row[];
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
      moduleKey="risks-issues"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      initialLayout={layout}
      rowTone={closedTone}
      getRowId={(row) => row.RiskIssueId}
      getRowLabel={riskIssueLabel}
      filtersActive={filtersActive}
      onOpen={(row) =>
        update({ id: String(row.RiskIssueId), page: searchParams.get("page") ?? null })
      }
      renderCard={(row) => (
        <div className="flex flex-col gap-1.5">
          <div
            aria-label={
              isClosed(row.Status)
                ? `${riskIssueLabel(row)}, ${messages.risksIssues.closed}`
                : riskIssueLabel(row)
            }
            className={[
              "line-clamp-2 text-sm font-semibold",
              isClosed(row.Status) ? "text-ink-muted" : "text-ink",
            ].join(" ")}
          >
            {richContent(row.views.Description, row.Description)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ListBadge list="risk-issue.category" value={row.Category} />
            <ListBadge list="risk-issue.status" value={row.Status} />
            <ListBadge list="risk-issue.priority" value={row.Priority} />
          </div>
        </div>
      )}
      columns={columns}
      sort={RISK_ISSUE_SORT}
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate
          ? {
              add: (values) => createRiskIssueAction({ ...values, projectId: String(projectId) }),
            }
          : undefined,
      }}
      renderToolbar={(viewToggle) => <RiskIssueToolbar>{viewToggle}</RiskIssueToolbar>}
      empty={listEmptyState(filtersActive, messages.risksIssues.emptyBody, newItemAction)}
    />
  );
}
