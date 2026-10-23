"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { booleanColumn, choiceColumn, textColumn } from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import type { MultiSelectOption } from "@/components/ui/form/multi-select";
import { listEmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import { formatDate } from "@/lib/format";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { createRequirementAction, updateRequirementAction } from "../actions";
import type { RequirementListRow, RequirementRow } from "../schemas/requirement";
import { MAX_REQUIREMENT_LENGTH, REQUIREMENT_SORT } from "../schemas/requirement";
import { requirementFormValues } from "../schemas/requirement-form";
import { requirementRef } from "../schemas/requirement-rules";
import {
  isSolution,
  REQUIREMENT_TYPES,
  typeLabel,
  type RequirementType,
} from "../schemas/requirement-types";
import {
  coverageText,
  deliverablesText,
  mergeSelection,
  newRequirementType,
  refsText,
  typeIsFree,
} from "./register-model";
import { RequirementsToolbar } from "./requirements-toolbar";

type Row = RequirementListRow;
const M = messages.requirements;
const P = M.placeholders;

const typeChoices = REQUIREMENT_TYPES.map((type) => ({
  value: type,
  label: M.typeWithCode(typeLabel(type), type),
}));

/** Datasheet edits go through the same update action as the sheet (ADR-0023). */
const saveCell = formCellSaver<Row, RequirementRow>(requirementFormValues, updateRequirementAction);
const canEditRow = rowAllows("requirements:update");

/**
 * The project's requirement register (ADR-0037): DataView datasheet over usp_Requirement_List.
 * Wording, met tick and a free row's type edit in a cell; links and allocations are the sheet's,
 * since each needs the whole picture. Selecting needs offers the merge into a new solution.
 */
export function RequirementsView({
  rows,
  totalCount,
  page,
  initialView,
  layout,
  filtersActive,
  filterType,
  deliverableOptions,
  projectId,
  canCreate,
  newRequirementAction,
}: {
  rows: RequirementListRow[];
  projectId: number;
  /** Shows the datasheet's new-entry row. */
  canCreate: boolean;
  totalCount: number;
  page: number;
  initialView: ViewMode;
  /** The user's saved datasheet layout (DataView initialLayout). */
  layout?: ListLayout | null;
  filtersActive: boolean;
  /** The filtered type, which a new row starts with. */
  filterType: RequirementType | null;
  /** The project's deliverables, for the allocation references. */
  deliverableOptions: MultiSelectOption[];
  newRequirementAction?: React.ReactNode;
}) {
  const { update, searchParams } = useListUrlState();

  const columns = useMemo<DataViewColumn<Row>[]>(
    () => [
      {
        key: "Ref",
        header: M.ref,
        priority: 1,
        render: (r) => requirementRef(r.RequirementType, r.Number),
      },
      choiceColumn({
        key: "RequirementType",
        header: M.type,
        priority: 2,
        field: "requirementType",
        value: (r) => r.RequirementType,
        choices: typeChoices,
        clearable: false,
        initial: newRequirementType(filterType),
        placeholder: P.type,
        // A linked or allocated row changes type in the sheet, which offers only the types that fit.
        editable: typeIsFree,
      }),
      textColumn({
        key: "Requirement",
        header: M.requirement,
        priority: 1,
        field: "requirement",
        value: (r) => r.Requirement,
        placeholder: P.requirement,
        maxLength: MAX_REQUIREMENT_LENGTH,
      }),
      booleanColumn({
        key: "IsMet",
        header: M.met,
        priority: 2,
        field: "isMet",
        value: (r) => r.IsMet,
        yes: M.yes,
        no: M.no,
        placeholder: P.isMet,
        editable: (r) => isSolution(r.RequirementType),
      }),
      {
        key: "Deliverables",
        header: M.deliverables,
        priority: 3,
        render: (r) => deliverablesText(r.DeliverableIds, deliverableOptions),
      },
      { key: "Validates", header: M.validates, priority: 2, render: (r) => refsText(r.Validates) },
      {
        key: "ValidatedBy",
        header: M.validatedBy,
        priority: 3,
        render: (r) => refsText(r.ValidatedBy),
      },
      { key: "Coverage", header: M.coverage, priority: 2, render: coverageText },
      {
        key: "CreatedAtUtc",
        header: M.addedAt,
        priority: 3,
        render: (r) => formatDate(r.CreatedAtUtc),
      },
    ],
    [deliverableOptions, filterType],
  );

  return (
    <DataView
      moduleKey="requirements"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      initialLayout={layout}
      getRowId={(row) => row.RequirementId}
      getRowLabel={(row) => row.Requirement}
      filtersActive={filtersActive}
      onOpen={(row) =>
        update({ id: String(row.RequirementId), page: searchParams.get("page") ?? null })
      }
      renderCard={(row) => (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-ink-muted">
            {M.typeWithRef(
              typeLabel(row.RequirementType),
              requirementRef(row.RequirementType, row.Number),
            )}
          </p>
          <p className="text-sm font-semibold text-ink">{row.Requirement}</p>
          <p className="text-xs text-ink-muted">{coverageText(row)}</p>
        </div>
      )}
      columns={columns}
      sort={REQUIREMENT_SORT}
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate
          ? {
              add: (values) => createRequirementAction({ ...values, projectId: String(projectId) }),
            }
          : undefined,
      }}
      bulkActions={
        canCreate
          ? (selectedIds, clear) => {
              const merge = mergeSelection(rows, selectedIds);
              if (!merge) return null;
              return (
                <Button
                  data-testid="requirements-merge"
                  onClick={() => {
                    update({ id: "new", type: merge.type, validates: merge.validates });
                    clear();
                  }}
                >
                  {M.merge}
                </Button>
              );
            }
          : undefined
      }
      renderToolbar={(viewToggle) => <RequirementsToolbar>{viewToggle}</RequirementsToolbar>}
      empty={listEmptyState(filtersActive, M.emptyBody, newRequirementAction)}
    />
  );
}
