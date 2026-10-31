"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { choiceColumn, textColumn } from "@/components/ui/data-view/columns";
import { DatasheetAddRow } from "@/components/ui/data-view/datasheet-cells";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { Field } from "@/components/ui/form/field";
import { Select } from "@/components/ui/form/inputs";
import { buttonClass } from "@/components/ui/button-styles";
import { Panel } from "@/components/ui/panel";
import type { ActionResult } from "@/lib/action";
import type { OptionColor } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { createTransactionAction, updateTransactionAction } from "../actions";
import { SECTIONS, type MonitorFigures, type MonitorStatus } from "../calc/engine";
import { fiscalYearLabel } from "../calc/fiscal";
import {
  applyRate,
  formatMoney,
  formatMoneyField,
  formatPercent,
  parseFraction,
  parseMoney,
} from "../calc/money";
import { calculateSheet } from "../calc/sheet";
import type { SheetDto, TransactionDto } from "../schemas/financial";
import { DatasheetTable, RecordRow, useDatasheetFeedback, useSavedRows } from "./datasheet-table";
import { newTransactionValues, transactionValues, withTransactionCell } from "./transaction-cells";
import { TransactionSheet } from "./transaction-sheet";

const M = messages.financials;
const P = M.placeholders.transaction;
const transactionId = (t: TransactionDto) => t.id;

const STATUS_TONE: Record<MonitorStatus, OptionColor> = {
  idle: "gray",
  ok: "green",
  low: "orange",
  over: "red",
  unbudgeted: "purple",
};

function StatusBadge({ status }: { status: MonitorStatus }) {
  return <Badge value={M.status[status]} tone={STATUS_TONE[status]} />;
}

function Figures({ figures, currency }: { figures: MonitorFigures; currency: string }) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatMoney(figures.budgetBeforeTax, currency)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatMoney(figures.spentBeforeTax, currency)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatMoney(figures.balanceBeforeTax, currency)}
        <span className="block text-xs text-ink-muted">
          {formatMoney(figures.balance, currency)}
        </span>
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={figures.status} />
      </td>
    </>
  );
}

/**
 * Budget monitoring (ADR-0029, the workbook's "Monitoring execution budget"):
 * per line, for all years or one fiscal year, the budget, what was spent and
 * the balance before tax (tax included underneath), flagged by the
 * financial's threshold; then every transaction, with no fixed number of rows,
 * in a datasheet like every list's: cells edited where they are, a new-entry
 * row to record an invoice, and ↗ to its sheet.
 */
export function MonitoringPanel({
  sheet,
  canCreate,
  canEdit,
  canDelete,
}: {
  sheet: SheetDto;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const feedback = useDatasheetFeedback();
  const f = sheet.financial;
  const [year, setYear] = useState<string>("all");
  const [openId, setOpenId] = useState<number | null>(null);

  const [transactions, keepTransaction] = useSavedRows(sheet.transactions, transactionId);
  const { monitor } = useMemo(
    () => calculateSheet({ ...sheet, transactions }),
    [sheet, transactions],
  );
  const yearIndex = year === "all" ? null : monitor.years.indexOf(Number(year));
  const pick = <T extends { total: MonitorFigures; cells: MonitorFigures[] }>(row: T) =>
    yearIndex === null ? row.total : row.cells[yearIndex]!;
  const shown = transactions.filter((t) => year === "all" || t.fiscalYear === Number(year));
  const opened = openId === null ? undefined : transactions.find((t) => t.id === openId);

  const columns: DataViewColumn<TransactionDto>[] = [
    {
      key: "date",
      header: M.date,
      priority: 1,
      render: (t) => t.date,
      edit: { kind: "date", field: "date", value: (t) => t.date, placeholder: P.date },
    },
    choiceColumn({
      key: "fiscalYear",
      header: M.fiscalYear,
      priority: 1,
      field: "fiscalYear",
      value: (t) => String(t.fiscalYear),
      choices: monitor.years.map((y) => ({
        value: String(y),
        label: fiscalYearLabel(y, f.startMonth),
      })),
      emptyLabel: M.fiscalYearAuto,
      placeholder: P.fiscalYear,
    }),
    choiceColumn({
      key: "lineId",
      header: M.line,
      priority: 1,
      field: "lineId",
      value: (t) => String(t.lineId),
      choices: sheet.lines.map((l) => ({ value: String(l.id), label: l.description })),
      clearable: false,
      initial: sheet.lines[0] ? String(sheet.lines[0].id) : "",
      placeholder: P.line,
    }),
    textColumn({
      key: "reference",
      header: M.reference,
      priority: 1,
      field: "reference",
      value: (t) => t.reference,
      placeholder: P.reference,
      maxLength: 100,
    }),
    textColumn({
      key: "description",
      header: M.description,
      priority: 1,
      field: "description",
      value: (t) => t.description,
      placeholder: P.description,
      maxLength: 255,
    }),
    {
      key: "amount",
      header: M.amountBeforeTax,
      priority: 1,
      render: (t) => (
        <span className="block text-right tabular-nums">
          {formatMoney(parseMoney(t.amount) ?? 0n, f.currency)}
        </span>
      ),
      edit: {
        kind: "text",
        numeric: true,
        field: "amount",
        value: (t) => formatMoneyField(t.amount),
        placeholder: P.amount,
        maxLength: 24,
      },
    },
    {
      key: "withTax",
      header: M.withTax,
      priority: 1,
      render: (t) => {
        const rate = parseFraction(t.taxRate) ?? 0n;
        return (
          <span
            className="block text-right tabular-nums"
            title={`${M.capturedRate}: ${formatPercent(rate)} %`}
          >
            {formatMoney(applyRate(parseMoney(t.amount) ?? 0n, rate), f.currency)}
          </span>
        );
      },
    },
  ];
  const rowLabel = (t: TransactionDto) => t.reference ?? t.date;

  /** One cell, sent with the rest of the transaction as it is (the sheet's update action). */
  const saveCell = async (
    t: TransactionDto,
    column: DataViewColumn<TransactionDto>,
    value: string,
  ) => {
    const next = withTransactionCell(t, column.edit!.field, value, f.startMonth);
    const result = await updateTransactionAction({
      transactionId: t.id,
      rowVer: t.rowVer,
      ...transactionValues(next, f.startMonth),
    });
    if (!result.ok) {
      feedback.failed(result.error);
      return false;
    }
    keepTransaction({ ...next, rowVer: result.data.rowVer });
    feedback.saved(column.header);
    return true;
  };

  const addTransaction = async (draft: Record<string, string>): Promise<ActionResult<unknown>> => {
    const result = await createTransactionAction(newTransactionValues(draft));
    if (result.ok) feedback.added();
    else feedback.failed(result.error);
    return result;
  };

  return (
    <div className="flex flex-col gap-6" data-testid="monitoring-panel">
      <Panel id="monitoring-heading" title={M.monitoringTab}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-60">
            <Field label={M.fiscalYear} name="monitor-year">
              <Select value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="all">{M.total}</option>
                {monitor.years.map((y) => (
                  <option key={y} value={y}>
                    {fiscalYearLabel(y, f.startMonth)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <a
            href={`/projects/${f.projectId}/financials/${f.id}/export`}
            className={buttonClass("secondary")}
            data-testid="export-csv"
          >
            {M.exportCsv}
          </a>
        </div>

        <div
          className="relative overflow-x-auto rounded-md border border-line bg-surface"
          tabIndex={0}
          role="region"
          aria-label={M.monitoringTab}
        >
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-raised font-medium text-ink-muted">
                <th scope="col" className="px-3 py-2 text-left">
                  {M.description}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {M.budgetLabel}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {M.spent}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {M.balance}
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  {M.statusLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section) => (
                <SectionRows key={section} section={section}>
                  {sheet.lines
                    .filter((l) => l.section === section)
                    .map((line) => (
                      <tr key={line.id} className="border-t border-line" data-testid="monitor-line">
                        <th scope="row" className="px-3 py-2 text-left font-normal">
                          {line.description}
                        </th>
                        <Figures
                          figures={pick(monitor.lines.get(line.id)!)}
                          currency={f.currency}
                        />
                      </tr>
                    ))}
                  <tr className="border-t border-line bg-surface-raised font-medium">
                    <th scope="row" className="px-3 py-2 text-left">
                      <span className="sr-only">{M.sectionTotal(M.sections[section])}</span>
                    </th>
                    <Figures figures={pick(monitor.sections[section])} currency={f.currency} />
                  </tr>
                </SectionRows>
              ))}
              <tr
                className="border-t-2 border-line bg-surface-raised font-semibold"
                data-testid="monitor-total"
              >
                <th scope="row" className="px-3 py-2 text-left">
                  {M.total}
                </th>
                <Figures figures={pick(monitor.total)} currency={f.currency} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-ink-muted">
          {M.balance}: {M.beforeTax} / <span className="text-xs">{M.withTax}</span>
        </p>
        {monitor.uncounted.length > 0 ? (
          <p className="text-sm text-warning">{M.uncounted}</p>
        ) : null}
      </Panel>

      <Panel id="fin-transactions" title={M.transactions}>
        <DatasheetTable label={M.transactions} columns={columns}>
          <tbody data-testid="transaction-list">
            {shown.map((t) => (
              <RecordRow
                key={t.id}
                row={t}
                columns={columns}
                editable={canEdit}
                label={rowLabel(t)}
                onSave={(column, value) => saveCell(t, column, value)}
                onOpen={() => setOpenId(t.id)}
                testId="transaction-row"
              />
            ))}
            {canCreate && sheet.lines.length > 0 ? (
              <DatasheetAddRow
                columns={columns}
                hasSelectColumn={false}
                columnStyle={() => undefined}
                onAdd={addTransaction}
              />
            ) : null}
          </tbody>
        </DatasheetTable>
      </Panel>

      {opened ? (
        <TransactionSheet
          key={`${opened.id}:${opened.rowVer}`}
          sheet={sheet}
          transaction={opened}
          open
          onOpenChange={(open) => !open && setOpenId(null)}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      ) : null}
    </div>
  );
}

function SectionRows({
  section,
  children,
}: {
  section: (typeof SECTIONS)[number];
  children: React.ReactNode;
}) {
  return (
    <>
      <tr className="border-t border-line">
        <th scope="colgroup" colSpan={5} className="px-3 py-2 text-left font-semibold">
          {M.sections[section]}
        </th>
      </tr>
      {children}
    </>
  );
}
