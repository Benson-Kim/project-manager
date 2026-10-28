"use client";
import { useState } from "react";
import { Input } from "@/components/ui/form/inputs";
import { Combobox } from "@/components/ui/form/combobox";
import { Field } from "@/components/ui/form/field";
import { messages } from "@/lib/messages";
import type { BoardView } from "../schemas/board-view";
import {
  createBoardColumnInput,
  updateBoardColumnInput,
  deleteBoardColumnInput,
} from "../schemas/board-column";
import { BOARD_COLUMN_NAME_MAX, COLUMN_CATEGORIES, WIP_LIMIT_MAX } from "../schemas/board-rules";
import { boardFormSchema } from "../schemas/board-form";
import {
  createBoardColumnAction,
  updateBoardColumnAction,
  deleteBoardColumnAction,
} from "../actions";
import { BoardForm, BoardField } from "./board-form";
import { BoardConfirm } from "./board-confirm";
const M = messages.boards;
export function ColumnDialog({
  board,
  id,
  deleting = false,
  close,
}: {
  board: BoardView;
  id?: number;
  deleting?: boolean;
  close: () => void;
}) {
  const column = board.columns.find((c) => c.BoardColumnId === id);
  const choices = board.columns.filter((c) => c.BoardColumnId !== id);
  const [target, setTarget] = useState<number | null>(choices[0]?.BoardColumnId ?? null);
  if (id && !column) return null;
  if (deleting && column)
    return (
      <BoardConfirm
        title={M.deleteColumnTitle}
        body={M.deleteColumnBody(
          column.CardCount,
          choices.find((c) => c.BoardColumnId === target)?.Name ?? M.ui.column,
        )}
        schema={deleteBoardColumnInput}
        input={{
          boardColumnId: column.BoardColumnId,
          rowVer: column.RowVer,
          targetColumnId: target,
        }}
        save={deleteBoardColumnAction}
        close={close}
      >
        <Field name="targetColumnId" label={M.ui.column}>
          <Combobox
            name="targetColumnId"
            defaultValue={String(target ?? "")}
            options={choices.map((c) => ({ value: String(c.BoardColumnId), label: c.Name }))}
            onSelect={(option) => setTarget(option ? Number(option.value) : null)}
          />
        </Field>
      </BoardConfirm>
    );
  return (
    <BoardForm
      title={column ? M.ui.editColumn : M.ui.newColumn}
      close={close}
      schema={boardFormSchema(
        column ? updateBoardColumnInput : createBoardColumnInput,
        column
          ? { boardColumnId: column.BoardColumnId, rowVer: column.RowVer }
          : { boardId: board.header.BoardId },
      )}
      save={(input) =>
        "boardColumnId" in input ? updateBoardColumnAction(input) : createBoardColumnAction(input)
      }
    >
      <BoardField name="name" label={M.ui.column}>
        <Input
          name="name"
          defaultValue={column?.Name}
          maxLength={BOARD_COLUMN_NAME_MAX}
          autoFocus
        />
      </BoardField>
      <BoardField name="category" label={M.ui.category}>
        <Combobox
          name="category"
          defaultValue={column?.Category ?? "todo"}
          options={COLUMN_CATEGORIES.map((category) => ({
            value: category,
            label: M.defaultColumns[category],
          }))}
        />
      </BoardField>
      <BoardField name="wipLimit" label={M.ui.limit}>
        <Input
          name="wipLimit"
          type="number"
          min={1}
          max={WIP_LIMIT_MAX}
          defaultValue={column?.WipLimit ?? ""}
        />
      </BoardField>
    </BoardForm>
  );
}
