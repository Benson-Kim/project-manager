"use client";

import { textColumn } from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import { formatDate } from "@/lib/format";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { createKeywordAction, updateKeywordAction } from "../actions";
import type { KeywordListRow, KeywordRow } from "../schemas/keyword";
import { keywordFormValues } from "../schemas/keyword-form";
import { KeywordsToolbar } from "./keywords-toolbar";

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
const saveCell = formCellSaver<Row, KeywordRow>(keywordFormValues, updateKeywordAction);
const canEditRow = rowAllows("keywords:update");

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
  newKeywordAction?: React.ReactNode;
}) {
  const { update, searchParams } = useListUrlState();

  return (
    <DataView
      moduleKey="keywords"
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
      columns={columns}
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate
          ? { add: (values) => createKeywordAction({ ...values, projectId: String(projectId) }) }
          : undefined,
      }}
      renderToolbar={(viewToggle) => <KeywordsToolbar>{viewToggle}</KeywordsToolbar>}
      empty={listEmptyState(filtersActive, messages.keywords.emptyBody, newKeywordAction)}
    />
  );
}
