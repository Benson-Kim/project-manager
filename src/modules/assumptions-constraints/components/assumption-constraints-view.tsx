"use client";

import { booleanColumn, listColumn, textColumn } from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { createAssumptionConstraintAction, updateAssumptionConstraintAction } from "../actions";
import type {
  AssumptionConstraintListRow,
  AssumptionConstraintRow,
} from "../schemas/assumption-constraint";
import { assumptionConstraintFormValues } from "../schemas/assumption-constraint-form";
import { AssumptionConstraintToolbar } from "./assumption-constraint-toolbar";

type Row = AssumptionConstraintListRow;
const P = messages.assumptionsConstraints.placeholders;

const columns: DataViewColumn<Row>[] = [
  textColumn({
    key: "Description",
    header: messages.assumptionsConstraints.description,
    priority: 1,
    field: "description",
    value: (r) => r.Description,
    placeholder: P.description,
    maxLength: 4000,
    render: (r) => <span>{r.Description ?? messages.app.untitled}</span>,
  }),
  listColumn({
    key: "Type",
    header: messages.assumptionsConstraints.type,
    priority: 2,
    field: "type",
    list: "assumption-constraint.type",
    value: (r) => r.Type,
    placeholder: P.type,
    render: (r) => (
      <span className="text-sm text-ink-muted">
        {r.Type ?? messages.assumptionsConstraints.typeNone}
      </span>
    ),
  }),
  listColumn({
    key: "Impact",
    header: messages.assumptionsConstraints.impact,
    priority: 2,
    field: "impact",
    list: "assumption-constraint.impact",
    value: (r) => r.Impact,
    placeholder: P.impact,
  }),
  booleanColumn({
    key: "IsValidated",
    header: messages.assumptionsConstraints.isValidated,
    priority: 3,
    field: "isValidated",
    value: (r) => r.IsValidated,
    yes: messages.assumptionsConstraints.validatedYes,
    no: messages.assumptionsConstraints.validatedNo,
    placeholder: P.isValidated,
  }),
];

/** Datasheet edits go through the same update action as the Sheet (ADR-0023). */
const saveCell = formCellSaver<Row, AssumptionConstraintRow>(
  assumptionConstraintFormValues,
  updateAssumptionConstraintAction,
);
const canEditRow = rowAllows("assumptions-constraints:update");

/**
 * Assumptions & constraints list (module #13): DataView grid + list;
 * opening a row syncs ?id= (Sheet). List view is a datasheet (ADR-0023):
 * editable cells and a new-entry row.
 */
export function AssumptionConstraintsView({
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
  rows: AssumptionConstraintListRow[];
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
      moduleKey="assumptions-constraints"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      initialLayout={layout}
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
          {row.Type ? <span className="text-xs text-ink-muted">{row.Type}</span> : null}
          {row.IsValidated ? (
            <span className="text-xs text-ink-muted">
              {messages.assumptionsConstraints.isValidated}
            </span>
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
                createAssumptionConstraintAction({ ...values, projectId: String(projectId) }),
            }
          : undefined,
      }}
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
