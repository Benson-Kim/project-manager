"use client";

import { DataView } from "@/components/ui/data-view/data-view";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";
import { formatDate } from "@/lib/format";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import type { ObjectiveListRow } from "../schemas/objective";
import { ObjectivesToolbar } from "./objectives-toolbar";

const columns: DataViewColumn<ObjectiveListRow>[] = [
  {
    key: "ObjectiveText",
    header: messages.objectives.objectiveText,
    priority: 1,
    render: (r) => r.ObjectiveText,
  },
  {
    key: "QMeasurable",
    header: messages.objectives.qMeasurable,
    priority: 2,
    render: (r) => r.QMeasurable,
  },
  {
    key: "QAlignmentStrategy",
    header: messages.objectives.qAlignmentStrategy,
    priority: 2,
    render: (r) => r.QAlignmentStrategy,
  },
  {
    key: "CreatedAtUtc",
    header: "Added",
    priority: 3,
    render: (r) => formatDate(r.CreatedAtUtc),
  },
];

/** Objectives list (module #9): DataView; opening a row syncs ?id= sheet. */
export function ObjectivesView({
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  newObjectiveAction,
}: {
  rows: ObjectiveListRow[];
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
      renderToolbar={(viewToggle) => (
        <ObjectivesToolbar>{viewToggle}</ObjectivesToolbar>
      )}
      empty={listEmptyState(filtersActive, messages.objectives.emptyBody, newObjectiveAction)}
    />
  );
}
