"use client";

import { useId, useState } from "react";
import { moveKey, ROW_HEIGHT_MAX, ROW_HEIGHT_MIN, clampRowHeight } from "@/lib/list-layout";
import { messages } from "@/lib/messages";
import { Button } from "../button";
import { Dialog } from "../dialog";
import { IconButton } from "./datasheet-cells";

interface ArrangeableColumn {
  key: string;
  header: string;
}

/**
 * "Table layout" (ADR-0023): the keyboard and touch way to arrange a
 * datasheet — column order and row height. Dragging a header or a row edge is
 * the pointer shortcut; column widths are set by dragging (or arrowing) a
 * header's edge. Save applies; "Reset to default" restores the module's layout
 * (order, widths and row height).
 */
export function TableLayoutDialog({
  columns,
  rowHeight,
  open,
  onOpenChange,
  onApply,
  onReset,
}: {
  /** The columns in their current display order. */
  columns: readonly ArrangeableColumn[];
  rowHeight: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (layout: { order: string[]; rowHeight: number }) => void;
  onReset: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={messages.datasheet.tableLayout}>
      {open ? (
        <TableLayoutEditor
          columns={columns}
          rowHeight={rowHeight}
          onApply={(layout) => {
            onApply(layout);
            onOpenChange(false);
          }}
          onReset={() => {
            onReset();
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function TableLayoutEditor({
  columns,
  rowHeight,
  onApply,
  onReset,
  onCancel,
}: {
  columns: readonly ArrangeableColumn[];
  rowHeight: number;
  onApply: (layout: { order: string[]; rowHeight: number }) => void;
  onReset: () => void;
  onCancel: () => void;
}) {
  const headers = new Map(columns.map((column) => [column.key, column.header]));
  const [keys, setKeys] = useState(() => columns.map((column) => column.key));
  const [height, setHeight] = useState(rowHeight);
  const heightId = useId();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">{messages.datasheet.arrangeHint}</p>
      <ol className="flex flex-col gap-2" data-testid="column-order-list">
        {keys.map((key, index) => {
          const header = headers.get(key) ?? key;
          return (
            <li
              key={key}
              className="flex min-h-10 items-center gap-1 rounded-md border border-line bg-surface px-3"
            >
              <span className="w-6 text-xs text-ink-muted" aria-hidden="true">
                {index + 1}
              </span>
              <span className="flex-1 text-sm text-ink">{header}</span>
              <IconButton
                label={messages.datasheet.moveColumnUp(header)}
                disabled={index === 0}
                onClick={() => setKeys((current) => moveKey(current, index, index - 1))}
              >
                <path d="M4 10l4-4 4 4" />
              </IconButton>
              <IconButton
                label={messages.datasheet.moveColumnDown(header)}
                disabled={index === keys.length - 1}
                onClick={() => setKeys((current) => moveKey(current, index, index + 1))}
              >
                <path d="M4 6l4 4 4-4" />
              </IconButton>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-1">
        <label htmlFor={heightId} className="text-sm leading-6 text-ink">
          {messages.datasheet.rowHeight(height)}
        </label>
        <input
          id={heightId}
          type="range"
          min={ROW_HEIGHT_MIN}
          max={ROW_HEIGHT_MAX}
          step={4}
          value={height}
          onChange={(e) => setHeight(clampRowHeight(Number(e.target.value)))}
          className="w-full accent-(--accent)"
        />
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="secondary" onClick={onReset}>
          {messages.datasheet.resetLayout}
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {messages.actions.cancel}
          </Button>
          <Button onClick={() => onApply({ order: keys, rowHeight: height })}>
            {messages.actions.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
