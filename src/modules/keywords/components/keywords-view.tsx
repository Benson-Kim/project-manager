"use client";

import { DataView } from "@/components/ui/data-view/data-view";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";
import { formatDate } from "@/lib/format";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import type { KeywordListRow } from "../schemas/keyword";
import { KeywordsToolbar } from "./keywords-toolbar";

const columns: DataViewColumn<KeywordListRow>[] = [
  {
    key: "Keyword",
    header: messages.keywords.keyword,
    priority: 1,
    render: (r) => r.Keyword,
  },
  {
    key: "Definition",
    header: messages.keywords.definition,
    priority: 1,
    render: (r) => r.Definition,
  },
  {
    key: "CreatedAtUtc",
    header: "Added",
    priority: 3,
    render: (r) => formatDate(r.CreatedAtUtc),
  },
];

/** Keywords list (module #8): DataView; opening a row syncs ?id=  sheet). */
export function KeywordsView({
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  newKeywordAction,
}: {
  rows: KeywordListRow[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
  filtersActive: boolean;
  newKeywordAction?: React.ReactNode;
}) {
  const { update } = useListUrlState();

  return (
    <DataView
      moduleKey="keywords"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      getRowId={(row) => row.KeywordId}
      getRowLabel={(row) => row.Keyword}
      onOpen={(row) => update({ id: String(row.KeywordId) })}
      renderCard={(row) => (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-ink">{row.Keyword}</p>
          {row.Definition ? (
            <p className="text-xs text-ink-muted">{row.Definition}</p>
          ) : null}
        </div>
      )}
      columns={columns}
      renderToolbar={(viewToggle) => (
        <KeywordsToolbar>{viewToggle}</KeywordsToolbar>
      )}
      empty={listEmptyState(filtersActive, messages.keywords.emptyBody, newKeywordAction)}
    />
  );
}
