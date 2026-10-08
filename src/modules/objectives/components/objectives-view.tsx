"use client";

import { textColumn } from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import { formatDate } from "@/lib/format";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { createObjectiveAction, updateObjectiveAction } from "../actions";
import type { ObjectiveListRow, ObjectiveRow } from "../schemas/objective";
import { objectiveFormValues } from "../schemas/objective-form";
import { ObjectivesToolbar } from "./objectives-toolbar";

type Row = ObjectiveListRow;
const P = messages.objectives.placeholders;

const columns: DataViewColumn<Row>[] = [
  textColumn({
    key: "ObjectiveText",
    header: messages.objectives.objectiveText,
    priority: 1,
    field: "objectiveText",
    value: (r) => r.ObjectiveText,
    placeholder: P.objectiveText,
    maxLength: 2000,
  }),
  textColumn({
    key: "QMeasurable",
    header: messages.objectives.qMeasurable,
    priority: 2,
    field: "qMeasurable",
    value: (r) => r.QMeasurable,
    placeholder: P.qMeasurable,
    maxLength: 255,
  }),
  textColumn({
    key: "QAlignmentStrategy",
    header: messages.objectives.qAlignmentStrategy,
    priority: 2,
    field: "qAlignmentStrategy",
    value: (r) => r.QAlignmentStrategy,
    placeholder: P.qAlignmentStrategy,
    maxLength: 255,
  }),
  {
    key: "CreatedAtUtc",
    header: messages.objectives.addedAt,
    priority: 3,
    render: (r) => formatDate(r.CreatedAtUtc),
  },
];

/** Datasheet edits go through the same update action as the Sheet (ADR-0023). */
const saveCell = formCellSaver<Row, ObjectiveRow>(objectiveFormValues, updateObjectiveAction);
const canEditRow = rowAllows("objectives:update");

/** Objectives list (module #9): DataView; opening a row syncs ?id= sheet. */
export function ObjectivesView({
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  projectId,
  canCreate,
  newObjectiveAction,
}: {
  rows: ObjectiveListRow[];
  projectId: number;
  /** Shows the datasheet's new-entry row. */
  canCreate: boolean;
  totalCount: number;
  page: number;
  initialView: ViewMode;
  filtersActive: boolean;
  newObjectiveAction?: React.ReactNode;
}) {
  const { update } = useListUrlState();

  return (
    <DataView
      moduleKey="objectives"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      getRowId={(row) => row.ObjectiveId}
      getRowLabel={(row) => row.ObjectiveText ?? messages.app.untitled}
      onOpen={(row) => update({ id: String(row.ObjectiveId) })}
      renderCard={(row) => (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-ink">
            {row.ObjectiveText ?? messages.app.untitled}
          </p>
          {row.QMeasurable ? (
            <p className="text-xs text-ink-muted">
              {messages.objectives.qMeasurable}: {row.QMeasurable}
            </p>
          ) : null}
        </div>
      )}
      columns={columns}
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate
          ? { add: (values) => createObjectiveAction({ ...values, projectId: String(projectId) }) }
          : undefined,
      }}
      renderToolbar={(viewToggle) => <ObjectivesToolbar>{viewToggle}</ObjectivesToolbar>}
      empty={listEmptyState(filtersActive, messages.objectives.emptyBody, newObjectiveAction)}
    />
  );
}
