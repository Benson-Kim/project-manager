"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAnnouncer } from "@/components/ui/announcer";
import {
  CELL_WIDTH,
  cellWidthKind,
  DEFAULT_ROW_HEIGHT,
  failureMessage,
  isEditableTarget,
} from "@/components/ui/data-view/datasheet";
import {
  cellClass,
  DatasheetCell,
  editableCellClass,
  HeaderCell,
  IconButton,
} from "@/components/ui/data-view/datasheet-cells";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";

/**
 * The financials datasheets (budget lines, transactions) are the list modules'
 * datasheet (ADR-0023) with sections and totals between the rows, so they lay
 * out the shared header, cells and new-entry row themselves: the same grid,
 * row height, carets and "Edit list…", inputs where the viewer may edit, and
 * ↗ to open the record's sheet.
 */
export function DatasheetTable<Row>({
  label,
  columns,
  children,
}: {
  label: string;
  columns: DataViewColumn<Row>[];
  /** The <tbody> sections. */
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative max-h-[calc(100dvh-5rem)] scroll-pt-14 overflow-auto print:max-h-none print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      <table
        style={{ "--row-h": `${DEFAULT_ROW_HEIGHT}px` } as React.CSSProperties}
        className="w-full border-collapse border border-line text-sm"
      >
        <thead className="sticky top-0 z-20 print:static">
          <tr>
            {columns.map((column) => (
              <HeaderCell key={column.key} column={column} />
            ))}
            <th className="w-24 border border-line bg-surface-raised px-3 py-2 text-left font-medium text-ink-muted">
              <span className="sr-only">{messages.datasheet.actions}</span>
            </th>
          </tr>
        </thead>
        {children}
      </table>
    </div>
  );
}

/**
 * A record's row: its cells, inputs when `editable`, saved as they are left;
 * a click outside the inputs, or ↗, opens the record.
 */
export function RecordRow<Row>({
  row,
  columns,
  editable,
  label,
  cellTitle,
  onSave,
  onOpen,
  actions,
  testId,
}: {
  row: Row;
  columns: DataViewColumn<Row>[];
  editable: boolean;
  /** The row's name, in its cells' accessible names. */
  label: string;
  /** A cell's hover note. */
  cellTitle?: (column: DataViewColumn<Row>) => string | undefined;
  /** Resolves true when saved; false puts the row's value back. */
  onSave: (column: DataViewColumn<Row>, value: string) => Promise<boolean>;
  onOpen: () => void;
  /** More buttons after ↗ (e.g. move up and down). */
  actions?: React.ReactNode;
  testId?: string;
}) {
  return (
    <tr
      data-testid={testId}
      onClick={(e) => {
        // Clicks on a cell's control edit it; the rest of the row opens the record.
        if (!isEditableTarget(e.target as HTMLElement)) onOpen();
      }}
      className="cursor-pointer"
    >
      {columns.map((column) =>
        editable && column.edit ? (
          <td
            key={column.key}
            title={cellTitle?.(column)}
            className={`${editableCellClass} ${CELL_WIDTH[cellWidthKind(column.edit)]}`}
          >
            <DatasheetCell
              row={row}
              editor={column.edit}
              label={messages.datasheet.cellLabel(column.header, label)}
              header={column.header}
              onSave={(value) => onSave(column, value)}
            />
          </td>
        ) : (
          <td
            key={column.key}
            title={cellTitle?.(column)}
            className={`${cellClass} wrap-break-word`}
          >
            {column.render(row)}
          </td>
        ),
      )}
      <td className={`${cellClass} py-1`}>
        <div className="flex items-center">
          <IconButton label={messages.datasheet.open(label)} onClick={onOpen}>
            <path d="M6 3h7v7M13 3L5 11" />
          </IconButton>
          {actions}
        </div>
      </td>
    </tr>
  );
}

/**
 * The rows with what their cells saved since the page loaded, so a saved cell
 * shows at once and the next edit sends the new RowVer; refreshed rows replace
 * them (setState-during-render, not an effect). `id` must be stable.
 */
export function useSavedRows<Row>(rows: Row[], id: (row: Row) => number) {
  const [saved, setSaved] = useState<ReadonlyMap<number, Row>>(new Map());
  const [prevRows, setPrevRows] = useState(rows);
  if (prevRows !== rows) {
    setPrevRows(rows);
    setSaved(new Map());
  }
  const shown = useMemo(
    () => (saved.size ? rows.map((row) => saved.get(id(row)) ?? row) : rows),
    [rows, saved, id],
  );
  const keep = useCallback(
    (row: Row) => setSaved((current) => new Map(current).set(id(row), row)),
    [id],
  );
  return [shown, keep] as const;
}

/** What a cell save or a new entry tells the user, as the list datasheets do. */
export function useDatasheetFeedback() {
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  return {
    saved: (header: string) => {
      announce(messages.datasheet.saved(header));
      router.refresh();
    },
    added: () => {
      announce(messages.datasheet.added);
      router.refresh();
    },
    failed: (error: { message: string; fieldErrors?: Record<string, string[]> }) =>
      toast({ variant: "error", title: failureMessage(error) }),
  };
}
