"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DataView } from "@/components/ui/data-view/data-view";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { EmptyState } from "@/components/ui/states";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { formatDate } from "@/lib/format";
import { isApproachingDeadline, isOverdue, type TodoItemListRow } from "../schemas/todo-item";
import { reorderTodoItemAction } from "../actions";
import { TodoToolbar } from "./todo-toolbar";

/** Up/down reorder buttons rendered inside the DataView card/row (list view only). */
function ReorderControls({
  row,
  rows,
  canReorder,
}: {
  row: TodoItemListRow;
  rows: TodoItemListRow[];
  canReorder: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!canReorder || rows.length < 2) return null;

  const idx = rows.findIndex((r) => r.TodoItemId === row.TodoItemId);
  const isFirst = idx === 0;
  const isLast = idx === rows.length - 1;

  const move = (targetIdx: number) => {
    const target = rows[targetIdx];
    if (!target) return;
    startTransition(async () => {
      await reorderTodoItemAction({
        todoItemId: row.TodoItemId,
        newSortKey: target.SortKey,
        rowVer: row.RowVer,
      });
      router.refresh();
    });
  };

  return (
    <div className="ml-auto flex shrink-0 flex-col" aria-label={messages.todoItems.reorderLabel}>
      <button
        type="button"
        disabled={isFirst || pending}
        onClick={(e) => { e.stopPropagation(); move(idx - 1); }}
        aria-label={messages.todoItems.moveUp}
        className="flex h-5 w-5 items-center justify-center rounded text-ink-muted hover:bg-surface-hover disabled:opacity-30"
      >
        ▲
      </button>
      <button
        type="button"
        disabled={isLast || pending}
        onClick={(e) => { e.stopPropagation(); move(idx + 1); }}
        aria-label={messages.todoItems.moveDown}
        className="flex h-5 w-5 items-center justify-center rounded text-ink-muted hover:bg-surface-hover disabled:opacity-30"
      >
        ▼
      </button>
    </div>
  );
}

function buildColumns(
  rows: TodoItemListRow[],
  canReorder: boolean,
): DataViewColumn<TodoItemListRow>[] {
  return [
    {
      key: "TodoItem",
      header: messages.todoItems.todoItem,
      priority: 1,
      render: (r) => r.TodoItem,
    },
    {
      key: "Status",
      header: messages.todoItems.status,
      priority: 1,
      render: (r) => <Badge value={r.Status} />,
    },
    {
      key: "Priority",
      header: messages.todoItems.priority,
      priority: 1,
      render: (r) => <Badge value={r.Priority} />,
    },
    {
      key: "DueDate",
      header: messages.todoItems.dueDate,
      priority: 2,
      render: (r) => (
        <span
          className={
            isOverdue(r)
              ? "font-semibold text-red-600"
              : isApproachingDeadline(r)
                ? "font-semibold text-amber-700"
                : undefined
          }
        >
          {formatDate(r.DueDate) ?? messages.todoItems.noDueDate}
          {isOverdue(r) ? (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
              {messages.todoItems.overdue}
            </span>
          ) : isApproachingDeadline(r) ? (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
              {messages.todoItems.approachingDeadline}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "StartDate",
      header: messages.todoItems.startDate,
      priority: 3,
      render: (r) => formatDate(r.StartDate),
    },
    {
      key: "ProjectOrActivity",
      header: messages.todoItems.projectOrActivity,
      priority: 3,
      render: (r) => <Badge value={r.ProjectOrActivity} />,
    },
    {
      key: "Reorder",
      header: "",
      priority: 2,
      render: (r) => <ReorderControls row={r} rows={rows} canReorder={canReorder} />,
    },
  ];
}

/** To-do list: DataView; opening a row syncs ?id=. */
export function TodoView({
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  canReorder = false,
  newTodoAction,
  emptyBody,
}: {
  rows: TodoItemListRow[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
  filtersActive: boolean;
  canReorder?: boolean;
  newTodoAction?: React.ReactNode;
  emptyBody?: string;
}) {
  const { update } = useListUrlState();
  const columns = buildColumns(rows, canReorder);

  return (
    <DataView
      moduleKey="todo-items"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      getRowId={(row) => row.TodoItemId}
      getRowLabel={(row) => row.TodoItem ?? String(row.TodoItemId)}
      onOpen={(row) => update({ id: String(row.TodoItemId) })}
      renderCard={(row) => (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">
            {row.TodoItem ?? messages.app.untitled}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge value={row.Status} />
            <Badge value={row.Priority} />
          </div>
          {row.DueDate ? (
            <p
              className={
                isOverdue(row)
                  ? "text-xs font-semibold text-red-600"
                  : isApproachingDeadline(row)
                    ? "text-xs font-semibold text-amber-700"
                    : "text-xs text-ink-muted"
              }
            >
              {formatDate(row.DueDate)}
              {isOverdue(row)
                ? ` — ${messages.todoItems.overdue}`
                : isApproachingDeadline(row)
                  ? ` — ${messages.todoItems.approachingDeadline}`
                  : ""}
            </p>
          ) : null}
          {canReorder ? (
            <ReorderControls row={row} rows={rows} canReorder={canReorder} />
          ) : null}
        </div>
      )}
      columns={columns}
      renderToolbar={(viewToggle) => <TodoToolbar>{viewToggle}</TodoToolbar>}
      empty={
        filtersActive ? (
          <EmptyState
            title={messages.list.zeroResultsTitle}
            body={messages.list.zeroResultsBody}
          />
        ) : (
          <EmptyState
            title={messages.list.emptyTitle}
            body={emptyBody ?? messages.todoItems.emptyBody}
            action={newTodoAction}
          />
        )
      }
    />
  );
}
