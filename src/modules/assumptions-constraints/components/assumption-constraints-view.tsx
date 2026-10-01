"use client";

import { DataView } from "@/components/ui/data-view/data-view";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import type { AssumptionConstraintListRow } from "../schemas/assumption-constraint";
import { AssumptionConstraintToolbar } from "./assumption-constraint-toolbar";

const columns: DataViewColumn<AssumptionConstraintListRow>[] = [
  {
    key: "Description",
    header: messages.assumptionsConstraints.description,
    priority: 1,
    render: (r) => <span>{r.Description ?? messages.app.untitled}</span>,
  },
  {
    key: "Type",
    header: messages.assumptionsConstraints.type,
    priority: 2,
    render: (r) => (
      <span className="text-sm text-ink-muted">
        {r.Type ?? messages.assumptionsConstraints.typeNone}
      </span>
    ),
  },
  {
    key: "IsValidated",
    header: messages.assumptionsConstraints.isValidated,
    priority: 3,
    render: (r) => (
      <span className="text-sm text-ink-muted">
        {r.IsValidated ? "Yes" : "No"}
      </span>
    ),
  },
];

/**
 * Assumptions & constraints list (module #13): DataView grid + list;
 * opening a row syncs ?id= (Sheet).
 */
export function AssumptionConstraintsView({
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  newItemAction,
}: {
  rows: AssumptionConstraintListRow[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
  filtersActive: boolean;
  newItemAction?: React.ReactNode;
}) {
  const { update, searchParams } = useListUrlState();

  return (
    <DataView
      moduleKey="assumptions-constraints"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      getRowId={(row) => row.AssumptionConstraintId}
      getRowLabel={(row) => row.Description ?? messages.app.untitled}
      filtersActive={filtersActive}
      onOpen={(row) =>
        update({
          id: String(row.AssumptionConstraintId),
          page: searchParams.get("page") ?? null,
        })
      }
      renderCard={(row) => (
        <div className="flex flex-col gap-1.5">
          <p className="line-clamp-2 text-sm font-semibold text-ink">
            {row.Description ?? messages.app.untitled}
          </p>
          {row.Type ? (
            <span className="text-xs text-ink-muted">{row.Type}</span>
          ) : null}
          {row.IsValidated ? (
            <span className="text-xs text-ink-muted">
              {messages.assumptionsConstraints.isValidated}
            </span>
          ) : null}
        </div>
      )}
      columns={columns}
      renderToolbar={(viewToggle) => (
        <AssumptionConstraintToolbar>{viewToggle}</AssumptionConstraintToolbar>
      )}
      empty={listEmptyState(
        filtersActive,
        messages.assumptionsConstraints.emptyBody,
        newItemAction,
      )}
    />
  );
}
