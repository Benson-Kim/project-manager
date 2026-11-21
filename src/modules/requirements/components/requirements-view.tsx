"use client";

import { useMemo, useState } from "react";
import { PackageRequirementsButton } from "@/modules/boards/components/package-requirements";
import { useFullPage } from "@/components/shell/use-full-page";
import { Button } from "@/components/ui/button";
import { booleanColumn, choiceColumn, textColumn } from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { addUndo, formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import type { MultiSelectOption } from "@/components/ui/form/multi-select";
import { listEmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import { formatDate } from "@/lib/format";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import {
  createRequirementAction,
  deleteRequirementAction,
  updateRequirementAction,
} from "../actions";
import {
  clearColumnLabelAction,
  createChoiceAction,
  createRegisterColumnAction,
  deleteChoiceAction,
  deleteRegisterColumnAction,
  moveRegisterColumnAction,
  renameChoiceAction,
  renameRegisterColumnAction,
  setColumnLabelAction,
  setRegisterCellAction,
  setRegisterColumnKindAction,
} from "../actions/register-columns";
import type { LinkRule } from "../schemas/link-rules";
import {
  choiceFilterParam,
  REGISTER_BUILT_IN_COLUMNS,
  type ColumnLabel,
  type RegisterColumn,
} from "../schemas/register-columns";
import type { RequirementListRow, RequirementRow } from "../schemas/requirement";
import { MAX_REQUIREMENT_LENGTH, REQUIREMENT_SORT } from "../schemas/requirement";
import { requirementFormValues } from "../schemas/requirement-form";
import {
  canBeMet,
  isTest,
  REQUIREMENT_TYPES,
  typeLabel,
  type RequirementType,
} from "../schemas/requirement-types";
import {
  canAddSubRequirement,
  coverageText,
  deliverablesText,
  mergeSelection,
  newRequirementType,
  refCell,
  refsText,
  typeCell,
  typeIsFree,
} from "./register-model";
import {
  CustomColumnsButton,
  type CustomColumnActionSet,
} from "@/components/custom-columns/custom-columns-dialog";
import { useCustomColumns } from "@/components/custom-columns/use-custom-columns";
import { RequirementsToolbar } from "./requirements-toolbar";

type Row = RequirementListRow;
const M = messages.requirements;
const P = M.placeholders;

const columnActions: CustomColumnActionSet = {
  setLabel: setColumnLabelAction,
  clearLabel: clearColumnLabelAction,
  createColumn: createRegisterColumnAction,
  renameColumn: renameRegisterColumnAction,
  moveColumn: moveRegisterColumnAction,
  setColumnKind: setRegisterColumnKindAction,
  deleteColumn: deleteRegisterColumnAction,
  createChoice: createChoiceAction,
  renameChoice: renameChoiceAction,
  deleteChoice: deleteChoiceAction,
};

const typeChoices = REQUIREMENT_TYPES.map((type) => ({
  value: type,
  label: M.typeWithCode(typeLabel(type), type),
}));

/** Datasheet edits go through the same update action as the sheet (ADR-0023). */
const saveFormCell = formCellSaver<Row, RequirementRow>(
  requirementFormValues,
  updateRequirementAction,
);
const canEditRow = rowAllows("requirements:update");
const requirementId = (row: Row) => row.RequirementId;

/**
 * The project's requirement register (ADR-0037): DataView datasheet over usp_Requirement_List.
 * Wording, met tick and a free row's type edit in a cell; links and allocations are the sheet's,
 * since each needs the whole picture. Selecting needs offers the merge into a new solution, and
 * selecting solutions a new test case that validates them.
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
  linkRules,
  projectId,
  canCreate,
  canPackage = false,
  newRequirementAction,
  labels = [],
  registerColumns = [],
  choiceFilter = null,
  canManageColumns = { create: false, update: false, delete: false },
}: {
  rows: RequirementListRow[];
  linkRules: readonly LinkRule[];
  projectId: number;
  /** Shows the datasheet's new-entry row. */
  canCreate: boolean;
  canPackage?: boolean;
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
  /** The project's own names for built-in columns (ADR-0067). */
  labels?: readonly ColumnLabel[];
  /** The columns the project added, in their order. */
  registerColumns?: readonly RegisterColumn[];
  /** The choice the register is filtered by, as ids. */
  choiceFilter?: { columnId: number; optionId: number } | null;
  canManageColumns?: { create: boolean; update: boolean; delete: boolean };
}) {
  const { update, searchParams } = useListUrlState();
  const [fullPage, setFullPage] = useState(false);
  useFullPage(fullPage, () => setFullPage(false));

  const columns = useMemo<DataViewColumn<Row>[]>(
    () => [
      {
        key: "Ref",
        header: M.ref,
        priority: 1,
        // The server's whole path, indented by Depth and arrow-marked for a child (ADR-0048).
        render: refCell,
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
        // The cell reads "Sub-Requirement" for a child, as the client's mock-up shows: the
        // relationship goes here and the type stays visible in the reference's letters.
        render: typeCell,
        // A linked or allocated row changes type in the sheet, which offers only the types that
        // fit; a child and a row with children cannot change it at all (typeIsFree).
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
        editable: (r) => canBeMet(r.RequirementType),
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
      // Per row rather than in the toolbar: a sub-requirement is always "under this one", and the
      // deepest level stops offering it instead of letting usp_Requirement_Create refuse the save.
      {
        key: "AddSub",
        header: M.addSubRequirement,
        priority: 3,
        render: (r) =>
          canCreate && canAddSubRequirement(r) ? (
            <Button
              variant="secondary"
              data-testid={`requirement-add-sub-${r.RequirementId}`}
              aria-label={M.addSubRequirementUnder(r.Ref)}
              onClick={() => update({ id: "new", parent: String(r.RequirementId) })}
            >
              {M.addSubRequirement}
            </Button>
          ) : null,
      },
    ],
    [canCreate, deliverableOptions, filterType, update],
  );

  // A project's own column names replace only the headings; keys, data, sorting and saved
  // layouts stay on the stable keys (ADR-0067). Added columns go before the per-row button.
  const { shownColumns, saveCell } = useCustomColumns<Row>({
    columns,
    labels,
    added: registerColumns,
    canEdit: canEditRow,
    rowId: requirementId,
    setCell: setRegisterCellAction,
    fallback: saveFormCell,
    before: "AddSub",
  });

  const choiceColumns = registerColumns.filter((column) => column.Kind === "choice");

  return (
    <div
      data-testid="requirements-register"
      data-fit-frame={fullPage || undefined}
      className={fullPage ? "fixed inset-0 z-(--z-fullscreen) overflow-auto bg-surface p-4" : ""}
    >
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
              {M.typeWithRef(typeCell(row), row.Ref)}
            </p>
            <p className="text-sm font-semibold text-ink">{row.Requirement}</p>
            <p className="text-xs text-ink-muted">{coverageText(row)}</p>
          </div>
        )}
        columns={shownColumns}
        sort={REQUIREMENT_SORT}
        datasheet={{
          canEditRow,
          saveCell,
          addRow: canCreate
            ? {
                undo: addUndo(
                  (row: { RequirementId: number; RowVer: number }) => row.RequirementId,
                  (row) =>
                    deleteRequirementAction({
                      requirementId: row.RequirementId,
                      rowVer: row.RowVer,
                    }),
                ),
                add: (values) =>
                  createRequirementAction({ ...values, projectId: String(projectId) }),
              }
            : undefined,
        }}
        bulkActions={
          canCreate || canPackage
            ? (selectedIds, clear) => {
                const merge = mergeSelection(rows, selectedIds, linkRules);
                if (!selectedIds.length) return null;
                return (
                  <div className="flex flex-wrap gap-2">
                    {canPackage ? (
                      <PackageRequirementsButton
                        projectId={projectId}
                        selectedIds={selectedIds.map(Number)}
                      />
                    ) : null}
                    <Button
                      disabled={!canCreate || !merge}
                      data-testid="requirements-merge"
                      onClick={() => {
                        if (merge)
                          update({ id: "new", type: merge.type, validates: merge.validates });
                        clear();
                      }}
                    >
                      {merge && isTest(merge.type) ? M.newTest : M.merge}
                    </Button>
                  </div>
                );
              }
            : undefined
        }
        renderToolbar={(viewToggle) => (
          <RequirementsToolbar projectId={projectId} canPackage={canPackage}>
            {choiceColumns.map((column) => (
              <select
                key={column.ColumnId}
                aria-label={M.columns.filterLabel(column.Name)}
                data-testid={`requirements-choice-filter-${column.ColumnId}`}
                className="min-h-10 rounded-md border border-line bg-surface px-2 text-sm text-ink"
                value={
                  choiceFilter?.columnId === column.ColumnId ? String(choiceFilter.optionId) : ""
                }
                onChange={(event) =>
                  update({
                    cf: event.target.value
                      ? choiceFilterParam(column.ColumnId, Number(event.target.value))
                      : null,
                    page: null,
                  })
                }
              >
                <option value="">{M.columns.filterAll(column.Name)}</option>
                {column.Options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            ))}
            <CustomColumnsButton
              projectId={projectId}
              labels={labels}
              columns={registerColumns}
              can={canManageColumns}
              builtIns={REGISTER_BUILT_IN_COLUMNS}
              actions={columnActions}
            />
            {viewToggle}
            <Button
              type="button"
              variant="secondary"
              data-testid="requirements-full-page"
              onClick={() => setFullPage(!fullPage)}
            >
              {fullPage ? M.canvas.exitFullPage : M.canvas.fullPage}
            </Button>
          </RequirementsToolbar>
        )}
        empty={listEmptyState(filtersActive, M.emptyBody, newRequirementAction)}
      />
    </div>
  );
}
