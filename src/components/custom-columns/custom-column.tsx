"use client";

import type { DataViewColumn } from "@/components/ui/data-view/types";
import type { ActionResult } from "@/lib/action";
import {
  COLUMN_KIND_SPECS,
  cellInputValue,
  customCellField,
  type CustomCellValue,
  type CustomColumnDef,
} from "@/lib/custom-columns/kinds";
import { formatDate } from "@/lib/format";
import { DocumentLinkCell, SignOffCell, TodoCell } from "./custom-cells";

/**
 * A DataView column for a column someone added (ADR-0066). Dates and text are datasheet cells
 * (field "cell:<id>", saved through the owner's saveCell); a document link and the buttons are
 * cells of their own that call the owner's handlers. Any owner (a checklist, a register) builds
 * its added columns with this, so they look and behave the same everywhere.
 */
export function customColumn<Row>(spec: {
  column: CustomColumnDef;
  cell: (row: Row) => CustomCellValue | undefined;
  /** Whether the viewer may change this row's cells. */
  canEdit: (row: Row) => boolean;
  /** Saves a cell value the datasheet does not edit itself (a link, a sign-off "1" or ""). */
  save: (row: Row, value: string) => Promise<ActionResult<unknown>>;
  /** The to-do button, when the owner offers one. */
  todo?: {
    canRun: (row: Row) => boolean;
    run: (row: Row) => Promise<ActionResult<unknown>>;
    href: (todoId: number) => string;
  };
  priority?: 1 | 2 | 3;
}): DataViewColumn<Row> {
  const { column } = spec;
  const kind = COLUMN_KIND_SPECS[column.kind];
  const base = {
    key: customCellField(column.id),
    header: column.name,
    priority: spec.priority ?? 2,
  };

  if (column.kind === "date" || column.kind === "text") {
    return {
      ...base,
      render: (row) => {
        const value = cellInputValue(column.kind, spec.cell(row));
        return column.kind === "date" ? formatDate(value) : value;
      },
      edit: {
        kind: column.kind,
        field: base.key,
        value: (row) => cellInputValue(column.kind, spec.cell(row)),
        placeholder: "",
        maxLength: kind.maxLength,
        multiline: column.kind === "text" ? true : undefined,
        editable: spec.canEdit,
      },
    };
  }

  if (column.kind === "choice") {
    const options = column.options ?? [];
    const labelOf = (row: Row) => {
      const id = spec.cell(row)?.optionId;
      return options.find((option) => option.id === id)?.label ?? "";
    };
    return {
      ...base,
      render: labelOf,
      edit: {
        kind: "select",
        field: base.key,
        value: (row) => cellInputValue("choice", spec.cell(row)),
        choices: options.map((option) => ({ value: String(option.id), label: option.label })),
        clearable: true,
        currentLabel: (row) => labelOf(row) || null,
        placeholder: "",
        editable: spec.canEdit,
      },
    };
  }

  if (column.kind === "document") {
    return {
      ...base,
      render: (row) => (
        <DocumentLinkCell
          href={spec.cell(row)?.link ?? null}
          column={column.name}
          canEdit={spec.canEdit(row)}
          onSave={(value) => spec.save(row, value)}
        />
      ),
    };
  }

  if (column.actionKind === "todo" && spec.todo) {
    const todo = spec.todo;
    return {
      ...base,
      render: (row) => {
        const id = spec.cell(row)?.todoId;
        return (
          <TodoCell
            todoHref={id ? todo.href(id) : null}
            canRun={todo.canRun(row)}
            onRun={() => todo.run(row)}
          />
        );
      },
    };
  }

  return {
    ...base,
    render: (row) => {
      const cell = spec.cell(row);
      return (
        <SignOffCell
          signedAt={cell?.signedAt ?? null}
          signedBy={cell?.signedBy ?? null}
          column={column.name}
          canEdit={spec.canEdit(row)}
          onSet={(signed) => spec.save(row, signed ? "1" : "")}
        />
      );
    },
  };
}
