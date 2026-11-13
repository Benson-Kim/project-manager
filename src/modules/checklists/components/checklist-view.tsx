"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { AddColumnButton, ColumnsButton } from "@/components/custom-columns/column-dialogs";
import { customColumn } from "@/components/custom-columns/custom-column";
import { textColumn } from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { addUndo, failureMessage } from "@/components/ui/data-view/datasheet";
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
import {
  createColumnAction,
  createItemAction,
  deleteColumnAction,
  deleteItemAction,
  moveColumnAction,
  renameColumnAction,
  runTodoAction,
  setCellAction,
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

type Row = ChecklistItemListRow;
const M = messages.checklists;

const canEditRow = rowAllows("checklists:update");

const cellOf = (row: ChecklistItem, columnId: number) =>
  row.Cells.find((cell) => cell.columnId === columnId);

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
  can: { create: boolean; update: boolean; delete: boolean; makeTodo: boolean };
}) {
  const router = useRouter();
  const { toast } = useToast();

  /** Runs a write and refreshes the page when it lands. */
  const refreshing =
    <T,>(act: () => Promise<ActionResult<T>>) =>
    async (): Promise<ActionResult<T>> => {
      const result = await act();
      if (result.ok) router.refresh();
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
      : await updateItemAction({ itemId: row.ChecklistItemId, title: value, rowVer: row.RowVer });
    return result.ok ? { ok: true, data: result.data } : result;
  };

  /** A new row: its title first, then any cells typed into the new-entry row, in turn. */
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
        toast({ variant: "error", title: failureMessage(result.error) });
        break;
      }
      row = result.data;
    }
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
      bulkActions={undefined}
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
  );
}
