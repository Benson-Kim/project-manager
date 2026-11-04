"use client";

import {
  dateColumn,
  listColumn,
  richTextColumn,
  textColumn,
} from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { ListBadge } from "@/components/ui/lookup-lists";
import type { WithRichViews } from "@/components/ui/rich-text/rich-views";
import { listEmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import type { OptionColor } from "@/lib/lookup-lists";
import type { StakeholderOption } from "@/modules/stakeholders/repository/stakeholder-options";
import { updateDecisionAction, createDecisionAction } from "../actions";
import { DECISION_SORT, type DecisionListRow, type DecisionRow } from "../schemas/decision";
import { decisionFormValues } from "../schemas/decision-form";
import { DecisionToolbar } from "./decision-toolbar";

export type DecisionListItem = WithRichViews<
  DecisionListRow,
  "ProblemContext" | "OptionsConsidered" | "Rationale" | "NextSteps"
>;
type Row = DecisionListItem;

const M = messages.decisions;
const P = M.placeholders;

/** The decision as a row label or a title: its number and what it decided. */
export const decisionLabel = (row: { DecisionNumber: number; Title: string }) =>
  M.refWithTitle(row.DecisionNumber, row.Title || messages.app.untitled);

/** The people names a column or card shows, by id, from the project's roster. */
function namesOf(ids: readonly number[], people: readonly StakeholderOption[]): string {
  const byId = new Map(people.map((person) => [person.stakeholderId, person.name]));
  return ids.map((id) => byId.get(id) ?? String(id)).join(", ");
}

/**
 * The register's columns. The number is assigned under the project lock by
 * usp_Decision_Create, so it is read-only here; both sets are read-only in the
 * grid because a cell edit never sends their Set flags, and the Sheet owns them.
 */
function buildColumns(people: readonly StakeholderOption[]): DataViewColumn<Row>[] {
  return [
    {
      key: "DecisionNumber",
      header: M.number,
      priority: 1,
      render: (row) => M.ref(row.DecisionNumber),
    },
    textColumn({
      key: "Title",
      header: M.decisionTitle,
      priority: 1,
      field: "title",
      value: (row) => row.Title,
      placeholder: P.title,
      maxLength: 255,
      multiline: true,
    }),
    listColumn({
      key: "Status",
      header: M.status,
      priority: 1,
      field: "status",
      list: "decision.status",
      value: (row) => row.Status,
      placeholder: P.status,
    }),
    dateColumn({
      key: "DateLogged",
      header: M.dateLogged,
      priority: 2,
      field: "dateLogged",
      value: (row) => row.DateLogged,
      placeholder: P.dateLogged,
    }),
    {
      key: "ImpactedAreas",
      header: M.impactedAreas,
      priority: 2,
      render: (row) => row.ImpactedAreas.join(", "),
    },
    {
      key: "OwnerStakeholderId",
      header: M.owner,
      priority: 3,
      render: (row) =>
        row.OwnerStakeholderId === null ? "" : namesOf([row.OwnerStakeholderId], people),
    },
    richTextColumn({
      key: "ProblemContext",
      header: M.problemContext,
      priority: 3,
      field: "problemContext",
      value: (row) => row.ProblemContext,
      placeholder: P.problemContext,
      view: (row) => row.views.ProblemContext,
    }),
    richTextColumn({
      key: "OptionsConsidered",
      header: M.optionsConsidered,
      priority: 3,
      field: "optionsConsidered",
      value: (row) => row.OptionsConsidered,
      placeholder: P.optionsConsidered,
      view: (row) => row.views.OptionsConsidered,
    }),
    richTextColumn({
      key: "Rationale",
      header: M.rationale,
      priority: 3,
      field: "rationale",
      value: (row) => row.Rationale,
      placeholder: P.rationale,
      view: (row) => row.views.Rationale,
    }),
    richTextColumn({
      key: "NextSteps",
      header: M.nextSteps,
      priority: 3,
      field: "nextSteps",
      value: (row) => row.NextSteps,
      placeholder: P.nextSteps,
      view: (row) => row.views.NextSteps,
    }),
  ];
}

/** Datasheet edits go through the same update action as the Sheet (ADR-0023). */
const saveCell = formCellSaver<Row, DecisionRow>(decisionFormValues, updateDecisionAction);
const canEditRow = rowAllows("decisions:update");

/** A decision another one replaced is muted, the way a closed record is. */
const supersededTone = (row: Row): OptionColor | null =>
  row.SupersededByDecisionId === null ? null : "gray";

/**
 * Decision log register (ADR-0055, BL36): DataView grid + list; opening a row
 * syncs ?id= (Sheet). List view is a datasheet (ADR-0023): editable cells and a
 * new-entry row. A superseded decision stays in the log, muted — the chain is
 * the record of what replaced what.
 */
export function DecisionsView({
  rows,
  people,
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
  /** The project's stakeholders, for the owner and consulted names. */
  people: StakeholderOption[];
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
      moduleKey="decisions"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      initialLayout={layout}
      rowTone={supersededTone}
      getRowId={(row) => row.DecisionId}
      getRowLabel={decisionLabel}
      filtersActive={filtersActive}
      onOpen={(row) =>
        update({ id: String(row.DecisionId), page: searchParams.get("page") ?? null })
      }
      renderCard={(row) => (
        <div className="flex flex-col gap-1.5">
          <div
            aria-label={
              row.SupersededByDecisionId === null
                ? decisionLabel(row)
                : `${decisionLabel(row)}, ${M.superseded}`
            }
            className={[
              "line-clamp-2 text-sm font-semibold",
              row.SupersededByDecisionId === null ? "text-ink" : "text-ink-muted",
            ].join(" ")}
          >
            {decisionLabel(row)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ListBadge list="decision.status" value={row.Status} />
            {row.ImpactedAreas.map((area) => (
              <ListBadge key={area} list="decision.impacted-area" value={area} />
            ))}
          </div>
          {row.ConsultedStakeholderIds.length > 0 ? (
            <p className="text-sm text-ink-muted">{namesOf(row.ConsultedStakeholderIds, people)}</p>
          ) : null}
        </div>
      )}
      columns={buildColumns(people)}
      sort={DECISION_SORT}
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate
          ? { add: (values) => createDecisionAction({ ...values, projectId: String(projectId) }) }
          : undefined,
      }}
      renderToolbar={(viewToggle) => <DecisionToolbar>{viewToggle}</DecisionToolbar>}
      empty={listEmptyState(filtersActive, M.emptyBody, newItemAction)}
    />
  );
}
