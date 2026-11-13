"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  dateColumn,
  listColumn,
  projectColumn,
  textColumn,
} from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { addUndo, formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { ProjectLink } from "@/components/ui/project-link";
import { EmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import type { ListLayout } from "@/lib/list-layout";
import type { OptionColor } from "@/lib/lookup-lists";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { formatDate } from "@/lib/format";
import type { ProjectPicker } from "@/modules/projects/project-options";
import {
  TODO_ITEM_SORT,
  DEFAULT_DUE_SOON_DAYS,
  isApproachingDeadline,
  isOverdue,
  listedDates,
  type TodoItemListRow,
  type TodoItemRow,
} from "../schemas/todo-item";
import { todoItemFormValues } from "../schemas/todo-item-form";
import {
  createTodoItemAction,
  reorderTodoItemAction,
  updateTodoItemAction,
  deleteTodoItemAction,
} from "../actions";
import { TodoToolbar } from "./todo-toolbar";

type Row = TodoItemListRow;
const P = messages.todoItems.placeholders;

/** Due-date emphasis: overdue (danger) or approaching (warning) — design tokens only. */
function dueTone(row: Row, dueSoonDays: number): string | undefined {
  if (isOverdue(listedDates(row))) return "font-semibold text-danger";
  if (isApproachingDeadline(listedDates(row), dueSoonDays)) return "font-semibold text-warning";
  return undefined;
}

/** A series' date cells show its next occurrence, so its own dates are edited in the record sheet. */
const ownDates = (row: Row) => !row.Repeats;

/** Up/down reorder buttons rendered inside the DataView card/row (list view only). */
function ReorderControls({
  row,
  rows,
  canReorder,
}: {
  row: Row;
  rows: Row[];
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
        onClick={(e) => {
          e.stopPropagation();
          move(idx - 1);
        }}
        aria-label={messages.todoItems.moveUp}
        className="flex size-11 items-center justify-center rounded text-xs text-ink-muted hover:bg-surface-raised disabled:opacity-30"
      >
        ▲
      </button>
      <button
        type="button"
        disabled={isLast || pending}
        onClick={(e) => {
          e.stopPropagation();
          move(idx + 1);
        }}
        aria-label={messages.todoItems.moveDown}
        className="flex size-11 items-center justify-center rounded text-xs text-ink-muted hover:bg-surface-raised disabled:opacity-30"
      >
        ▼
      </button>
    </div>
  );
}

/** A series (ADR-0059): the list shows it once, marked so it is not taken for a one-off. */
function RepeatsBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-line bg-surface-sunken px-1.5 py-0.5 text-xs font-medium text-ink-muted ${className}`}
      data-testid="todo-repeats-badge"
    >
      {messages.todoItems.repeats}
    </span>
  );
}

function buildColumns(
  rows: Row[],
  canReorder: boolean,
  projects: ProjectPicker | undefined,
  dueSoonDays: number,
): DataViewColumn<Row>[] {
  return [
    // /todo only: which project each to-do belongs to, editable like the other cells.
    ...(projects ? [projectColumn<Row>({ priority: 2, ...projects })] : []),
    textColumn({
      key: "TodoItem",
      header: messages.todoItems.todoItem,
      priority: 1,
      field: "todoItem",
      value: (r) => r.TodoItem,
      placeholder: P.todoItem,
      maxLength: 255,
      render: (r) => (
        <>
          {r.TodoItem}
          {r.Repeats ? <RepeatsBadge className="ml-1.5" /> : null}
        </>
      ),
    }),
    listColumn({
      key: "Status",
      header: messages.todoItems.status,
      priority: 1,
      field: "status",
      list: "todo-item.status",
      value: (r) => r.Status,
      placeholder: P.status,
    }),
    textColumn({
      key: "Assignee",
      header: messages.todoItems.assignee,
      priority: 2,
      field: "assignee",
      value: (r) => r.Assignee,
      placeholder: P.assignee,
      maxLength: 255,
    }),
    listColumn({
      key: "Priority",
      header: messages.todoItems.priority,
      priority: 1,
      field: "priority",
      list: "todo-item.priority",
      value: (r) => r.Priority,
      placeholder: P.priority,
    }),
    dateColumn({
      key: "DueDate",
      header: messages.todoItems.dueDate,
      priority: 2,
      field: "dueDate",
      value: (r) => r.DueDate,
      placeholder: P.dueDate,
      editable: ownDates,
      render: (r) => (
        <span className={dueTone(r, dueSoonDays)}>
          {formatDate(listedDates(r).DueDate) || messages.todoItems.noDueDate}
          {isOverdue(listedDates(r)) ? (
            <span className="ml-1.5 inline-flex items-center rounded-full border border-danger bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-danger">
              {messages.todoItems.overdue}
            </span>
          ) : isApproachingDeadline(listedDates(r), dueSoonDays) ? (
            <span className="ml-1.5 inline-flex items-center rounded-full border border-warning bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning">
              {messages.todoItems.approachingDeadline}
            </span>
          ) : null}
        </span>
      ),
    }),
    dateColumn({
      key: "StartDate",
      header: messages.todoItems.startDate,
      priority: 3,
      field: "startDate",
      value: (r) => r.StartDate,
      placeholder: P.startDate,
      editable: ownDates,
      render: (r) => formatDate(listedDates(r).StartDate),
    }),
    {
      key: "ProjectOrActivity",
      header: messages.todoItems.projectOrActivity,
      priority: 3,
      render: (r) => <Badge value={r.ProjectOrActivity} />,
    },
    {
      key: "Reorder",
      header: messages.todoItems.reorderLabel,
      // The order the buttons write; sorting by it puts the list back in manual order.
      sort: "SortKey",
      priority: 2,
      render: (r) => <ReorderControls row={r} rows={rows} canReorder={canReorder} />,
    },
  ];
}

/** Datasheet edits go through the same update action as the Sheet (ADR-0023). */
const saveCell = formCellSaver<Row, TodoItemRow>(todoItemFormValues, updateTodoItemAction);
/** The to-do rule per row (ADR-0021): own to-dos, or every to-do of projects you manage. */
const canEditRow = rowAllows("todo-items:update");
/** Overdue to-dos colour their whole row red — before any list colour (client feedback). */
const overdueTone = (row: Row): OptionColor | null => (isOverdue(listedDates(row)) ? "red" : null);

/**
 * To-do list: DataView with TodoToolbar; opening a row syncs ?id=. List view is
 * a datasheet (ADR-0023): editable cells per the row's ActorAccess and a
 * new-entry row (this project's to-dos; on /todo, the project its Project cell
 * names — personal when none).
 */
export function TodoView({
  rows,
  totalCount,
  page,
  initialView,
  layout,
  filtersActive,
  projectId,
  projects,
  projectFilterOptions,
  canCreate,
  canReorder = false,
  dueSoonDays = DEFAULT_DUE_SOON_DAYS,
  newTodoAction,
  emptyBody,
}: {
  rows: Row[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
  /** The user's saved datasheet layout (DataView initialLayout). */
  layout?: ListLayout | null;
  filtersActive: boolean;
  /** The project's page this list is on; null on /todo. */
  projectId: number | null;
  /** /todo: the Project column (where a to-do may go, and the new-entry row's project). */
  projects?: ProjectPicker;
  /** /todo: the toolbar's project filter. */
  projectFilterOptions?: readonly { id: number; name: string }[];
  canCreate: boolean;
  canReorder?: boolean;
  /** The user's "Due soon" window in days (Settings). */
  dueSoonDays?: number;
  newTodoAction?: React.ReactNode;
  emptyBody?: string;
}) {
  const { update } = useListUrlState();
  const columns = buildColumns(rows, canReorder, projects, dueSoonDays);

  return (
    <DataView
      moduleKey="todo-items"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      initialLayout={layout}
      rowTone={overdueTone}
      getRowId={(row) => row.TodoItemId}
      getRowLabel={(row) => row.TodoItem ?? messages.app.untitled}
      onOpen={(row) => update({ id: String(row.TodoItemId) })}
      renderToolbar={(viewToggle) => (
        <TodoToolbar projectFilterOptions={projectFilterOptions}>{viewToggle}</TodoToolbar>
      )}
      renderCard={(row) => (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">{row.TodoItem ?? messages.app.untitled}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge value={row.Status} />
            <Badge value={row.Priority} />
            {row.Repeats ? <RepeatsBadge /> : null}
          </div>
          {projects && row.ProjectName ? (
            <p className="text-xs text-ink-muted">
              <ProjectLink projectId={row.ProjectId} className="text-accent">
                {row.ProjectName}
              </ProjectLink>
            </p>
          ) : null}
          {listedDates(row).DueDate ? (
            <p className={`text-xs ${dueTone(row, dueSoonDays) ?? "text-ink-muted"}`}>
              {formatDate(listedDates(row).DueDate)}
              {isOverdue(listedDates(row))
                ? ` — ${messages.todoItems.overdue}`
                : isApproachingDeadline(listedDates(row), dueSoonDays)
                  ? ` — ${messages.todoItems.approachingDeadline}`
                  : ""}
            </p>
          ) : null}
          {canReorder ? <ReorderControls row={row} rows={rows} canReorder={canReorder} /> : null}
        </div>
      )}
      columns={columns}
      sort={TODO_ITEM_SORT}
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate
          ? {
              // The Project cell (on /todo) names the project; else this page's project.
              undo: addUndo(
                (row: { TodoItemId: number; RowVer: number }) => row.TodoItemId,
                (row) => deleteTodoItemAction({ todoItemId: row.TodoItemId, rowVer: row.RowVer }),
              ),
              add: (values) =>
                createTodoItemAction({
                  projectId: projectId === null ? "" : String(projectId),
                  ...values,
                }),
            }
          : undefined,
      }}
      empty={
        filtersActive ? (
          <EmptyState title={messages.list.zeroResultsTitle} body={messages.list.zeroResultsBody} />
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
