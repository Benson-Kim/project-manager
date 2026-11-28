"use client";

import { textColumn } from "@/components/ui/data-view/columns";
import {
  CustomColumnsButton,
  type CustomColumnActionSet,
} from "@/components/custom-columns/custom-columns-dialog";
import { useCustomColumns } from "@/components/custom-columns/use-custom-columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import type { ColumnLabel, RegisterColumn } from "@/lib/custom-columns/register";
import { formatDate } from "@/lib/format";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { createKeywordAction, updateKeywordAction } from "../actions";
import {
  clearKeywordColumnLabelAction,
  createKeywordChoiceAction,
  createKeywordColumnAction,
  deleteKeywordChoiceAction,
  deleteKeywordColumnAction,
  moveKeywordColumnAction,
  renameKeywordChoiceAction,
  renameKeywordColumnAction,
  setKeywordCellAction,
  setKeywordColumnKindAction,
  setKeywordColumnLabelAction,
} from "../actions/columns";
import { KEYWORD_BUILT_IN_COLUMNS } from "../schemas/columns";
import type { KeywordListRow, KeywordRow } from "../schemas/keyword";
import { keywordFormValues } from "../schemas/keyword-form";
import { KeywordsToolbar } from "./keywords-toolbar";
import { KEYWORD_SORT } from "../schemas/keyword";

type Row = KeywordListRow;
const P = messages.keywords.placeholders;

const columns: DataViewColumn<Row>[] = [
  textColumn({
    key: "Keyword",
    header: messages.keywords.keyword,
    priority: 1,
    field: "keyword",
    value: (r) => r.Keyword,
    placeholder: P.keyword,
    maxLength: 255,
  }),
  textColumn({
    key: "Definition",
    header: messages.keywords.definition,
    priority: 1,
    field: "definition",
    value: (r) => r.Definition,
    placeholder: P.definition,
    maxLength: 255,
  }),
  {
    key: "CreatedAtUtc",
    header: messages.keywords.addedAt,
    priority: 3,
    render: (r) => formatDate(r.CreatedAtUtc),
  },
];

/** Datasheet edits go through the same update action as the Sheet (ADR-0023). */
const saveFormCell = formCellSaver<Row, KeywordRow>(keywordFormValues, updateKeywordAction);
const canEditRow = rowAllows("keywords:update");
const keywordId = (row: Row) => row.KeywordId;
const NO_COLUMNS = { create: false, update: false, delete: false };

const columnActions: CustomColumnActionSet = {
  setLabel: setKeywordColumnLabelAction,
  clearLabel: clearKeywordColumnLabelAction,
  createColumn: createKeywordColumnAction,
  renameColumn: renameKeywordColumnAction,
  moveColumn: moveKeywordColumnAction,
  setColumnKind: setKeywordColumnKindAction,
  deleteColumn: deleteKeywordColumnAction,
  createChoice: createKeywordChoiceAction,
  renameChoice: renameKeywordChoiceAction,
  deleteChoice: deleteKeywordChoiceAction,
};

/**
 * Keywords list (module #8): DataView; opening a row syncs ?id= (sheet). List
 * view is a datasheet (ADR-0023): editable cells and a new-entry row.
 */
export function KeywordsView({
  rows,
  totalCount,
  page,
  initialView,
  layout,
  filtersActive,
  projectId,
  labels = [],
  addedColumns = [],
  canManageColumns = NO_COLUMNS,
  canCreate,
  newKeywordAction,
}: {
  rows: KeywordListRow[];
  projectId: number;
  /** Shows the datasheet's new-entry row. */
  canCreate: boolean;
  totalCount: number;
  page: number;
  initialView: ViewMode;
  /** The user's saved datasheet layout (DataView initialLayout). */
  layout?: ListLayout | null;
  filtersActive: boolean;
  /** The project's renamed headings and added columns. */
  labels?: readonly ColumnLabel[];
  addedColumns?: readonly RegisterColumn[];
  canManageColumns?: { create: boolean; update: boolean; delete: boolean };
  newKeywordAction?: React.ReactNode;
}) {
  const { update, searchParams } = useListUrlState();
  const { shownColumns, saveCell } = useCustomColumns<Row>({
    columns,
    labels,
    added: addedColumns,
    canEdit: canEditRow,
    rowId: keywordId,
    setCell: setKeywordCellAction,
    fallback: saveFormCell,
  });

  return (
    <DataView
      moduleKey="keywords"
      fullscreen
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      initialLayout={layout}
      getRowId={(row) => row.KeywordId}
      getRowLabel={(row) => row.Keyword}
      onOpen={(row) =>
        update({ id: String(row.KeywordId), page: searchParams.get("page") ?? null })
      }
      renderCard={(row) => (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-ink">{row.Keyword}</p>
          {row.Definition ? <p className="text-xs text-ink-muted">{row.Definition}</p> : null}
        </div>
      )}
      columns={shownColumns}
      sort={KEYWORD_SORT}
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate
          ? { add: (values) => createKeywordAction({ ...values, projectId: String(projectId) }) }
          : undefined,
      }}
      renderToolbar={(viewToggle) => (
        <KeywordsToolbar>
          <CustomColumnsButton
            projectId={projectId}
            labels={labels}
            columns={addedColumns}
            can={canManageColumns}
            builtIns={KEYWORD_BUILT_IN_COLUMNS}
            actions={columnActions}
            title={messages.customColumns.keywordTitle}
          />
          {viewToggle}
        </KeywordsToolbar>
      )}
      empty={listEmptyState(filtersActive, messages.keywords.emptyBody, newKeywordAction)}
    />
  );
}
