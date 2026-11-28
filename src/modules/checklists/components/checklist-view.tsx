"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { AddColumnButton, ColumnsButton } from "@/components/custom-columns/column-dialogs";
import { customColumn } from "@/components/custom-columns/custom-column";
import {
  choiceColumn,
  dateColumn,
  listColumn,
  richTextColumn,
  textColumn,
} from "@/components/ui/data-view/columns";
import { Button } from "@/components/ui/button";
import { DataView } from "@/components/ui/data-view/data-view";
import { addUndo, failureMessage } from "@/components/ui/data-view/datasheet";
import type { WithRichViews } from "@/components/ui/rich-text/rich-views";
import { SearchInput } from "@/components/ui/data-view/search-input";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { listEmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { Toolbar } from "@/components/ui/toolbar";
import type { ActionResult } from "@/lib/action";
import { rowAllows } from "@/lib/auth/actor-access";
import { CHECKLIST_KINDS, customCellColumnId } from "@/lib/custom-columns/kinds";
import { formatDateTime } from "@/lib/format";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import type { StakeholderOption } from "@/modules/stakeholders/repository/stakeholder-options";
import {
  addItemsToCalendarAction,
  createColumnAction,
  createItemAction,
  deleteColumnAction,
  deleteItemAction,
  moveColumnAction,
  renameColumnAction,
  runTodoAction,
  setCellAction,
  setItemDetailsAction,
  setItemDoneAction,
  updateItemAction,
} from "../actions";
import {
  CHECKLIST_ITEM_SORT,
  ITEM_TITLE_MAX,
  type Checklist,
  type ChecklistColumn,
  type ChecklistItem,
  type ChecklistItemListRow,
} from "../schemas/checklist";
import { ChecklistMenu } from "./checklist-menu";
import { nameItems, splitAddOutcome } from "./add-to-todo";
import { useFocusFirstInvalid } from "@/components/ui/form/use-focus-first-invalid";
import { notifySaved } from "@/lib/cross-window";

type Row = WithRichViews<ChecklistItemListRow, "Notes">;
const M = messages.checklists;

const canEditRow = rowAllows("checklists:update");

const DETAIL_FIELDS = new Set([
  "startDate",
  "dueDate",
  "assigneeStakeholderId",
  "priority",
  "notes",
]);

const detailValue = (field: string, value: string) =>
  value.trim() === "" ? null : field === "assigneeStakeholderId" ? Number(value) : value;

const cellOf = (row: ChecklistItem, columnId: number) =>
  row.Cells.find((cell) => cell.columnId === columnId);

/** Highlights the column's cell on rows that still need it: the sheet's input and the table's text. */
function markMissing(
  column: DataViewColumn<Row>,
  missing: (row: Row) => boolean,
): DataViewColumn<Row> {
  return {
    ...column,
    render: (row) =>
      missing(row) ? (
        <span
          data-invalid
          tabIndex={-1}
          title={M.dueDateMissing}
          className="block min-h-5 rounded bg-danger-soft px-1"
        >
          {column.render(row)}
        </span>
      ) : (
        column.render(row)
      ),
    edit: column.edit && { ...column.edit, invalid: missing },
  };
}

/**
 * The done tick: who ticked it and when are on its title. It shows the change at once and goes
 * back only if the save is refused.
 */
function DoneTick({ row, onChange }: { row: Row; onChange: (done: boolean) => Promise<void> }) {
  const [checked, show] = useOptimistic(row.IsDone);
  const [, start] = useTransition();
  const editable = canEditRow(row);
  const title =
    row.IsDone && row.DoneAtUtc
      ? M.doneBy(row.DoneByName ?? "", formatDateTime(row.DoneAtUtc))
      : undefined;
  return (
    <input
      type="checkbox"
      className="h-4 w-4 accent-[var(--accent)]"
      checked={checked}
      disabled={!editable}
      title={title}
      aria-label={M.markDone(row.Title)}
      data-testid="checklist-done"
      onChange={(event) => {
        const done = event.target.checked;
        start(async () => {
          show(done);
          await onChange(done);
        });
      }}
    />
  );
}

/**
 * One checklist (ADR-0066): a datasheet whose columns are the title, the done tick, and the
 * columns people added, in their order. Dates and text edit in the cell; a link, a sign-off and a
 * to-do are cells of their own. Every write answers with the row's new version, then the page
 * refreshes.
 */
export function ChecklistView({
  projectId,
  checklist,
  checklists,
  columns,
  rows,
  totalCount,
  page,
  initialView,
  layout,
  filtersActive,
  can,
  people,
}: {
  projectId: number;
  checklist: Checklist;
  checklists: readonly Checklist[];
  columns: readonly ChecklistColumn[];
  rows: Row[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
  layout?: ListLayout | null;
  filtersActive: boolean;
  can: { create: boolean; update: boolean; delete: boolean; makeTodo: boolean; makeBoard: boolean };
  people: readonly StakeholderOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  /** Items the last "Add to to-do list" turned back for having no dates; their Due date is marked. */
  const [undated, setUndated] = useState<ReadonlySet<number>>(new Set());
  const viewRef = useRef<HTMLDivElement>(null);
  const focusInvalid = useFocusFirstInvalid(viewRef);
  const needsDueDate = (row: Row) =>
    undated.has(row.ChecklistItemId) && !row.StartDate && !row.DueDate;

  const addToTodoList = async (selectedIds: readonly (string | number)[], clear: () => void) => {
    const result = await addItemsToCalendarAction({ itemIds: selectedIds.map(Number) });
    if (!result.ok) {
      toast({ variant: "error", title: failureMessage(result.error) });
      return;
    }
    const outcome = splitAddOutcome(result.data);
    setUndated(new Set(outcome.undated.map((row) => row.ChecklistItemId)));
    if (outcome.added.length > 0) toast({ variant: "success", title: M.addedToCalendar });
    if (outcome.already.length > 0)
      toast({ variant: "info", title: M.alreadyOnTodoList(nameItems(outcome.already)) });
    if (outcome.undated.length > 0) {
      toast({ variant: "error", title: M.needsDueDate(nameItems(outcome.undated)) });
      focusInvalid();
    } else {
      clear();
    }
    router.refresh();
    if (outcome.added.length > 0) notifySaved();
  };

  /** Runs a write and refreshes the page when it lands. */
  const refreshing =
    <T,>(act: () => Promise<ActionResult<T>>) =>
    async (): Promise<ActionResult<T>> => {
      const result = await act();
      if (result.ok) {
        router.refresh();
        notifySaved();
      }
      return result;
    };

  const setCell = (row: ChecklistItem, column: ChecklistColumn, value: string) =>
    setCellAction({
      itemId: row.ChecklistItemId,
      columnId: column.ChecklistColumnId,
      kind: column.Kind,
      value,
      rowVer: row.RowVer,
    });

  const setDone = async (row: Row, done: boolean) => {
    const result = await setItemDoneAction({
      itemId: row.ChecklistItemId,
      done,
      rowVer: row.RowVer,
    });
    if (!result.ok) toast({ variant: "error", title: failureMessage(result.error) });
    else notifySaved();
    router.refresh();
  };

  const viewColumns: DataViewColumn<Row>[] = [
    {
      key: "Done",
      header: M.done,
      priority: 1,
      render: (row) => <DoneTick row={row} onChange={(done) => setDone(row, done)} />,
    },
    textColumn<Row>({
      key: "Title",
      header: M.item,
      priority: 1,
      field: "title",
      value: (row) => row.Title,
      placeholder: M.itemPlaceholder,
      maxLength: ITEM_TITLE_MAX,
      editable: canEditRow,
    }),
    dateColumn<Row>({
      key: "StartDate",
      header: messages.todoItems.startDate,
      priority: 3,
      field: "startDate",
      value: (row) => (row.StartDate ? new Date(`${row.StartDate}T00:00:00Z`) : null),
      placeholder: messages.todoItems.placeholders.startDate,
      editable: canEditRow,
    }),
    markMissing(
      dateColumn<Row>({
        key: "DueDate",
        header: messages.todoItems.dueDate,
        priority: 2,
        field: "dueDate",
        value: (row) => (row.DueDate ? new Date(`${row.DueDate}T00:00:00Z`) : null),
        placeholder: messages.todoItems.placeholders.dueDate,
        editable: canEditRow,
      }),
      needsDueDate,
    ),
    listColumn<Row>({
      key: "Priority",
      header: messages.todoItems.priority,
      priority: 2,
      field: "priority",
      list: "todo-item.priority",
      value: (row) => row.Priority,
      placeholder: messages.todoItems.placeholders.priority,
      editable: canEditRow,
    }),
    choiceColumn<Row>({
      key: "AssigneeStakeholderId",
      header: M.assignee,
      priority: 3,
      field: "assigneeStakeholderId",
      value: (row) =>
        row.AssigneeStakeholderId === null ? null : String(row.AssigneeStakeholderId),
      choices: people.map((person) => ({
        value: String(person.stakeholderId),
        label: person.name,
      })),
      clearable: true,
      placeholder: M.assigneePlaceholder,
      editable: canEditRow,
    }),
    richTextColumn<Row>({
      key: "Notes",
      header: M.notes,
      priority: 3,
      field: "notes",
      value: (row) => row.Notes,
      view: (row) => row.views.Notes,
      placeholder: M.notesPlaceholder,
      editable: canEditRow,
    }),
    ...columns.map((column) =>
      customColumn<Row>({
        column: {
          id: column.ChecklistColumnId,
          name: column.Name,
          kind: column.Kind,
          actionKind: column.ActionKind,
        },
        cell: (row) => cellOf(row, column.ChecklistColumnId),
        canEdit: canEditRow,
        save: (row, value) => refreshing(() => setCell(row, column, value))(),
        todo: {
          canRun: () => can.makeTodo,
          run: (row) =>
            refreshing(() =>
              runTodoAction({ itemId: row.ChecklistItemId, columnId: column.ChecklistColumnId }),
            )(),
          href: (todoId) => `/projects/${projectId}/todos?id=${todoId}`,
        },
      }),
    ),
  ];

  const columnById = new Map(columns.map((column) => [column.ChecklistColumnId, column]));

  const saveCell = async (
    row: Row,
    field: string,
    value: string,
  ): Promise<ActionResult<Partial<Row>>> => {
    const columnId = customCellColumnId(field);
    const column = columnId === null ? undefined : columnById.get(columnId);
    const result = column
      ? await setCell(row, column, value)
      : DETAIL_FIELDS.has(field)
        ? await setItemDetailsAction({
            itemId: row.ChecklistItemId,
            startDate: row.StartDate,
            dueDate: row.DueDate,
            assigneeStakeholderId: row.AssigneeStakeholderId,
            priority: row.Priority,
            notes: row.Notes,
            rowVer: row.RowVer,
            [field]: detailValue(field, value),
          })
        : await updateItemAction({ itemId: row.ChecklistItemId, title: value, rowVer: row.RowVer });
    if (result.ok) notifySaved();
    return result.ok ? { ok: true, data: result.data } : result;
  };

  /**
   * A new row: its title first, then any cells typed into the new-entry row, in turn. A cell that
   * does not save takes the new row away again, so the typed values stay in the new-entry row and
   * saving again makes no second row.
   */
  const addRow = async (values: Record<string, string>): Promise<ActionResult<ChecklistItem>> => {
    const created = await createItemAction({
      checklistId: checklist.ChecklistId,
      title: values.title ?? "",
    });
    if (!created.ok) return created;
    let row = created.data;
    for (const [field, value] of Object.entries(values)) {
      const column = columnById.get(customCellColumnId(field) ?? 0);
      if (!column || value.trim() === "") continue;
      const result = await setCell(row, column, value);
      if (!result.ok) {
        await deleteItemAction({ itemId: row.ChecklistItemId, rowVer: row.RowVer });
        return result;
      }
      row = result.data;
    }
    const typed = (field: string) => (values[field]?.trim() ? values[field] : null);
    if ([...DETAIL_FIELDS].some((field) => typed(field) !== null)) {
      const result = await setItemDetailsAction({
        itemId: row.ChecklistItemId,
        startDate: typed("startDate"),
        dueDate: typed("dueDate"),
        assigneeStakeholderId:
          typed("assigneeStakeholderId") === null
            ? row.AssigneeStakeholderId
            : Number(typed("assigneeStakeholderId")),
        priority: typed("priority"),
        notes: typed("notes"),
        rowVer: row.RowVer,
      });
      if (!result.ok) {
        await deleteItemAction({ itemId: row.ChecklistItemId, rowVer: row.RowVer });
        return result;
      }
      row = result.data;
    }
    notifySaved();
    return { ok: true, data: row };
  };

  const managed = columns.map((column) => ({
    id: column.ChecklistColumnId,
    name: column.Name,
    kind: column.Kind,
    actionKind: column.ActionKind,
    rowVer: column.RowVer,
  }));

  return (
    <div
      ref={viewRef}
      data-cl-page-entity={checklist.ChecklistId}
      data-cl-page-label={checklist.Name}
      className="contents"
    >
      <DataView
        moduleKey="checklists"
        rows={rows}
        totalCount={totalCount}
        page={page}
        initialView={initialView}
        initialLayout={layout}
        getRowId={(row) => row.ChecklistItemId}
        getRowLabel={(row) => row.Title}
        renderCard={(row) => (
          <div className="flex items-start gap-2">
            <DoneTick row={row} onChange={(done) => setDone(row, done)} />
            <p className="text-sm font-semibold text-ink">{row.Title}</p>
          </div>
        )}
        columns={viewColumns}
        sort={CHECKLIST_ITEM_SORT}
        datasheet={{
          canEditRow,
          saveCell,
          addRow: can.create
            ? {
                add: addRow,
                undo: addUndo(
                  (row: ChecklistItem) => row.ChecklistItemId,
                  (row) => deleteItemAction({ itemId: row.ChecklistItemId, rowVer: row.RowVer }),
                ),
              }
            : undefined,
        }}
        bulkActions={
          can.makeTodo
            ? (selectedIds, clear) => (
                <Button
                  data-testid="checklist-add-to-calendar"
                  onClick={() => addToTodoList(selectedIds, clear)}
                >
                  {M.addToCalendar}
                </Button>
              )
            : undefined
        }
        renderToolbar={(viewToggle) => (
          <Toolbar>
            <ChecklistMenu
              projectId={projectId}
              checklists={checklists}
              current={checklist}
              can={can}
            />
            <SearchInput testId="checklist-search" />
            {can.create ? (
              <AddColumnButton
                kinds={CHECKLIST_KINDS}
                onAdd={(column) =>
                  refreshing(() =>
                    createColumnAction({ checklistId: checklist.ChecklistId, ...column }),
                  )()
                }
              />
            ) : null}
            {can.update && columns.length > 0 ? (
              <ColumnsButton
                columns={managed}
                canDelete={can.delete}
                onRename={(column, name) =>
                  refreshing(() =>
                    renameColumnAction({ columnId: column.id, name, rowVer: column.rowVer }),
                  )()
                }
                onMove={(column, direction) =>
                  refreshing(() =>
                    moveColumnAction({ columnId: column.id, direction, rowVer: column.rowVer }),
                  )()
                }
                onDelete={(column) =>
                  refreshing(() =>
                    deleteColumnAction({ columnId: column.id, rowVer: column.rowVer }),
                  )()
                }
              />
            ) : null}
            {viewToggle}
          </Toolbar>
        )}
        filtersActive={filtersActive}
        empty={listEmptyState(filtersActive, M.emptyBody)}
      />
    </div>
  );
}
