"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Select } from "@/components/ui/form/inputs";
import type { OptionColor } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { deleteTransactionAction } from "../actions";
import { SECTIONS, type MonitorFigures, type MonitorStatus } from "../calc/engine";
import { fiscalYearLabel } from "../calc/fiscal";
import { formatMoney, parseMoney } from "../calc/money";
import { calculateSheet } from "../calc/sheet";
import type { SheetDto, TransactionDto } from "../schemas/financial";
import { TransactionDialog } from "./transaction-dialog";
import { useFinancialAction } from "./use-financial-action";

const M = messages.financials;

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

function Figures({ figures }: { figures: MonitorFigures }) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(figures.budgetBeforeTax)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(figures.spentBeforeTax)}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatMoney(figures.balanceBeforeTax)}
        <span className="block text-xs text-ink-muted">{formatMoney(figures.balance)}</span>
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
 * financial's threshold; then every transaction, with no fixed number of rows.
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
  const { monitor } = useMemo(() => calculateSheet(sheet), [sheet]);
  const f = sheet.financial;
  const [year, setYear] = useState<string>("all");
  const [editing, setEditing] = useState<{
    transaction: TransactionDto | null;
    lineId: number | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<TransactionDto | null>(null);
  const action = useFinancialAction();
  const yearIndex = year === "all" ? null : monitor.years.indexOf(Number(year));
  const pick = <T extends { total: MonitorFigures; cells: MonitorFigures[] }>(row: T) =>
    yearIndex === null ? row.total : row.cells[yearIndex]!;
  const lineName = new Map(sheet.lines.map((l) => [l.id, l.description]));
  const shown = sheet.transactions.filter((t) => year === "all" || t.fiscalYear === Number(year));

  return (
    <div className="flex flex-col gap-4" data-testid="monitoring-panel">
      <ErrorSummary message={action.summary} />
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
          className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
          data-testid="export-csv"
        >
          {M.exportCsv}
        </a>
      </div>

      <div
        className="relative overflow-x-auto rounded-md border border-line"
        tabIndex={0}
        role="region"
        aria-label={M.monitoringTab}
      >
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
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
                      <Figures figures={pick(monitor.lines.get(line.id)!)} />
                    </tr>
                  ))}
                <tr className="border-t border-line bg-surface-raised font-medium">
                  <th scope="row" className="px-3 py-2 text-left">
                    {M.sectionTotal(M.sections[section])}
                  </th>
                  <Figures figures={pick(monitor.sections[section])} />
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
              <Figures figures={pick(monitor.total)} />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-sm text-ink-muted">
        {M.balance}: {M.beforeTax} / <span className="text-xs">{M.withTax}</span>
      </p>
      {monitor.uncounted.length > 0 ? <p className="text-sm text-warning">{M.uncounted}</p> : null}

      <section aria-labelledby="fin-transactions" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="fin-transactions" className="text-base font-medium text-ink">
            {M.transactions}
          </h2>
          {canCreate && sheet.lines.length > 0 ? (
            <Button
              variant="secondary"
              onClick={() => setEditing({ transaction: null, lineId: null })}
              data-testid="add-transaction"
            >
              {M.addTransaction}
            </Button>
          ) : null}
        </div>
        <ul className="flex flex-col gap-2" data-testid="transaction-list">
          {shown.map((t) => {
            const name = t.reference ?? t.date;
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-line px-3 py-2 text-sm"
              >
                <span className="tabular-nums">{t.date}</span>
                <span className="text-ink-muted">
                  {fiscalYearLabel(t.fiscalYear, f.startMonth)}
                </span>
                <span className="font-medium">{lineName.get(t.lineId)}</span>
                {t.reference ? <span>{t.reference}</span> : null}
                {t.description ? <span className="text-ink-muted">{t.description}</span> : null}
                <span className="ml-auto tabular-nums">
                  {formatMoney(parseMoney(t.amount) ?? 0n)}
                </span>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    onClick={() => setEditing({ transaction: t, lineId: t.lineId })}
                    aria-label={M.editTransaction(name)}
                  >
                    {messages.actions.edit}
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button
                    variant="ghost"
                    onClick={() => setDeleting(t)}
                    aria-label={M.deleteTransaction(name)}
                  >
                    {messages.actions.delete}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {editing ? (
        <TransactionDialog
          key={
            editing.transaction ? `${editing.transaction.id}:${editing.transaction.rowVer}` : "new"
          }
          sheet={sheet}
          transaction={editing.transaction}
          lineId={editing.lineId}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title={M.deleteTransaction(deleting.reference ?? deleting.date)}
          body={messages.confirmDelete.body}
          confirmLabel={messages.actions.delete}
          pending={action.pending}
          onConfirm={() =>
            action.run(
              () =>
                deleteTransactionAction({ transactionId: deleting.id, rowVer: deleting.rowVer }),
              {
                success: messages.feedback.deleted,
                onSuccess: () => setDeleting(null),
              },
            )
          }
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
