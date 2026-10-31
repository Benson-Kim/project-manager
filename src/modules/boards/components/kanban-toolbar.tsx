"use client";
import { Button } from "@/components/ui/button";
import { useLookupLists } from "@/components/ui/lookup-lists";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { MOSCOW } from "@/modules/requirements/schemas/moscow";
import {
  ALL,
  CARD_KINDS,
  isKanbanFiltering,
  kanbanFilterOf,
  type KanbanFilter,
  type KanbanStats,
} from "../schemas/board-kanban";

const K = messages.boards.kanban;
const select =
  "min-h-8 rounded-md border border-line bg-surface px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus";

/** `top` is the priority list's first option, the one the stat counts. */
export function KanbanStatsRow({ stats, top }: { stats: KanbanStats; top: string | null }) {
  return (
    <dl aria-label={K.stats} className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
      <div className="flex gap-1.5">
        <dt>{K.cards}</dt>
        <dd className="font-semibold text-ink" data-testid="kanban-total">
          {stats.cards}
        </dd>
      </div>
      <div className="flex gap-1.5">
        <dt>{K.mustHealth}</dt>
        <dd className="font-semibold text-ink" data-testid="kanban-must">
          {stats.mustHealth === null ? K.noMustHaves : `${stats.mustHealth}%`}
        </dd>
      </div>
      {top ? (
        <div className="flex gap-1.5">
          <dt>{K.priority(top)}</dt>
          <dd className="font-semibold text-ink" data-testid="kanban-top">
            {stats.topPriority}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

/**
 * The client-side filters over the loaded cards. The text search stays the server's
 * (SearchInput, ?q=), so "Clear filters" clears it too through `onClearSearch`.
 */
/** The board as JSON on the clipboard, in the board's top row beside its actions. */
export function CopyJsonButton({ copyJson }: { copyJson: () => string }) {
  const { toast } = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(copyJson());
      toast({ variant: "success", title: K.copied });
    } catch {
      toast({ variant: "error", title: K.copyFailed });
    }
  }
  return (
    <Button
      variant="secondary"
      size="compact"
      data-testid="kanban-copy-json"
      onClick={() => void copy()}
    >
      {K.copyJson}
    </Button>
  );
}

export function KanbanFilterBar({
  filter,
  onChange,
  searching,
  onClearSearch,
  shown,
  search,
}: {
  filter: KanbanFilter;
  onChange: (filter: KanbanFilter) => void;
  searching: boolean;
  onClearSearch: () => void;
  shown: number;
  /** The small search box, first in the tools row. */
  search?: React.ReactNode;
}) {
  const { lists } = useLookupLists();
  const priorities = lists["key-deliverable.priority"]?.options ?? [];
  const change = (patch: Partial<Record<keyof KanbanFilter, string>>) => {
    const next = { ...filter, ...patch };
    onChange(kanbanFilterOf(next.kind, next.moscow, next.priority));
  };
  return (
    <div role="group" aria-label={K.filters} className="flex flex-wrap items-center gap-2">
      {search}
      <select
        aria-label={K.kind}
        data-testid="kanban-kind"
        className={select}
        value={filter.kind}
        onChange={(e) => change({ kind: e.target.value })}
      >
        <option value={ALL}>{K.allKinds}</option>
        {CARD_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {K.kinds[kind]}
          </option>
        ))}
      </select>
      <select
        aria-label={K.moscow}
        data-testid="kanban-moscow"
        className={select}
        value={filter.moscow}
        onChange={(e) => change({ moscow: e.target.value })}
      >
        <option value={ALL}>{K.allMoscow}</option>
        {MOSCOW.map((code) => (
          <option key={code} value={code}>
            {K.contains(messages.requirements.moscow[code])}
          </option>
        ))}
      </select>
      {priorities.length ? (
        <select
          aria-label={K.priorityFilter}
          data-testid="kanban-priority"
          className={select}
          value={filter.priority}
          onChange={(e) => change({ priority: e.target.value })}
        >
          <option value={ALL}>{K.allPriorities}</option>
          {priorities.map((option) => (
            <option key={option.id} value={option.label}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
      {isKanbanFiltering(filter) || searching ? (
        <button
          type="button"
          data-testid="kanban-clear"
          onClick={() => {
            onChange(kanbanFilterOf(ALL, ALL, ALL));
            if (searching) onClearSearch();
          }}
          className="min-h-8 cursor-pointer px-1 text-sm font-semibold text-accent hover:underline"
        >
          {K.clear}
        </button>
      ) : null}
      <span
        className="ml-auto text-sm text-ink-muted"
        data-testid="kanban-count"
        aria-live="polite"
      >
        {K.showing(shown)}
      </span>
    </div>
  );
}
