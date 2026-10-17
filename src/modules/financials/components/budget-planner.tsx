"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { messages } from "@/lib/messages";
import { deleteLineAction, moveLineAction } from "../actions";
import { SECTIONS, type PlanCell, type Section, type Totals } from "../calc/engine";
import { fiscalYearLabel } from "../calc/fiscal";
import { formatMoney, parseMoney } from "../calc/money";
import { calculateSheet } from "../calc/sheet";
import type { LineDto, SheetDto } from "../schemas/financial";
import { LineDialog } from "./line-dialog";
import { useFinancialAction } from "./use-financial-action";

const M = messages.financials;

function Amounts({
  beforeTax,
  withTax,
  muted,
}: {
  beforeTax: bigint;
  withTax: bigint;
  muted?: boolean;
}) {
  return (
    <span
      className={`flex flex-col items-end tabular-nums ${muted ? "italic text-ink-muted" : ""}`}
    >
      <span>{formatMoney(beforeTax)}</span>
      <span className="text-xs text-ink-muted">{formatMoney(withTax)}</span>
    </span>
  );
}

function TotalsRow({ label, totals, testId }: { label: string; totals: Totals; testId?: string }) {
  return (
    <tr className="border-t border-line bg-surface-raised font-medium" data-testid={testId}>
      <th scope="row" className="sticky left-0 bg-surface-raised px-3 py-2 text-left text-sm">
        {label}
      </th>
      {totals.byYear.map((y) => (
        <td key={y.fiscalYear} className="px-3 py-2 text-sm">
          <Amounts beforeTax={y.beforeTax} withTax={y.withTax} />
        </td>
      ))}
      <td className="px-3 py-2 text-sm">
        <Amounts beforeTax={totals.beforeTax} withTax={totals.withTax} />
      </td>
      <td />
    </tr>
  );
}

/**
 * The budget planner (ADR-0029, the workbook's Budget Execution tab): lines by
 * section, each fiscal year's pre-tax amount over its tax-included amount,
 * section and overall totals, and the gap to the authorised budget. Totals come
 * from the shared engine. The table scrolls inside its own box, so the page
 * never scrolls sideways (360 px).
 */
export function BudgetPlanner({
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
  const { plan } = useMemo(() => calculateSheet(sheet), [sheet]);
  const f = sheet.financial;
  const [editing, setEditing] = useState<{ line: LineDto | null; section: Section } | null>(null);
  const [deleting, setDeleting] = useState<LineDto | null>(null);
  const action = useFinancialAction();
  const withTransactions = new Set(sheet.transactions.map((t) => t.lineId));
  const profileName = (id: number | null) =>
    sheet.profiles.find((p) => p.id === id)?.name ?? M.noTax;
  const authorised = f.budget ? parseMoney(f.budget) : null;
  const planned = f.budgetIncludesTax ? plan.total.withTax : plan.total.beforeTax;
  const over = authorised !== null && planned > authorised ? planned - authorised : null;

  const move = (line: LineDto, direction: "up" | "down") =>
    action.run(() => moveLineAction({ lineId: line.id, direction, rowVer: line.rowVer }));

  return (
    <div className="flex flex-col gap-4" data-testid="budget-planner">
      <ErrorSummary message={action.summary} />
      {action.conflict ? (
        <Button variant="secondary" onClick={action.reload}>
          {M.reload}
        </Button>
      ) : null}
      <p className="text-sm text-ink-muted">
        {M.beforeTax} / <span className="text-xs">{M.withTax}</span>
      </p>
      <div
        className="relative overflow-x-auto rounded-md border border-line"
        tabIndex={0}
        role="region"
        aria-label={M.budgetTab}
      >
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 bg-surface px-3 py-2 text-left">
                {M.description}
              </th>
              {plan.years.map((year) => (
                <th key={year} scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                  {fiscalYearLabel(year, f.startMonth)}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right">
                {M.total}
              </th>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">{messages.actions.edit}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((section) => {
              const lines = sheet.lines.filter((l) => l.section === section);
              return (
                <Fragment key={section}>
                  <tr className="border-t border-line">
                    <th
                      scope="colgroup"
                      colSpan={plan.years.length + 3}
                      className="px-3 py-2 text-left font-semibold"
                    >
                      {M.sections[section]}
                    </th>
                  </tr>
                  {lines.map((line, index) => {
                    const linePlan = plan.lines.get(line.id)!;
                    return (
                      <tr key={line.id} className="border-t border-line" data-testid="budget-line">
                        <th
                          scope="row"
                          className="sticky left-0 max-w-56 bg-surface px-3 py-2 text-left font-normal"
                        >
                          <span className="block text-ink">{line.description}</span>
                          <span className="block text-xs text-ink-muted">
                            {[
                              line.costCategory,
                              profileName(line.taxProfileId),
                              line.isRecurrent ? M.recurrent : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </th>
                        {linePlan.cells.map((cell: PlanCell) => (
                          <td
                            key={cell.fiscalYear}
                            className="px-3 py-2"
                            title={cell.source === "escalated" ? M.escalated : undefined}
                          >
                            <Amounts
                              beforeTax={cell.beforeTax}
                              withTax={cell.withTax}
                              muted={cell.source === "escalated"}
                            />
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          <Amounts beforeTax={linePlan.beforeTax} withTax={linePlan.withTax} />
                        </td>
                        <td className="px-1 py-1 whitespace-nowrap">
                          {canEdit ? (
                            <>
                              <Button
                                variant="ghost"
                                onClick={() => setEditing({ line, section })}
                                aria-label={M.editLine(line.description)}
                              >
                                {messages.actions.edit}
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={index === 0 || action.pending}
                                onClick={() => move(line, "up")}
                                aria-label={M.moveUp(line.description)}
                              >
                                ↑
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={index === lines.length - 1 || action.pending}
                                onClick={() => move(line, "down")}
                                aria-label={M.moveDown(line.description)}
                              >
                                ↓
                              </Button>
                            </>
                          ) : null}
                          {canDelete ? (
                            <Button
                              variant="ghost"
                              onClick={() => setDeleting(line)}
                              aria-label={M.deleteLine(line.description)}
                              disabled={withTransactions.has(line.id)}
                              title={withTransactions.has(line.id) ? M.lineInUse : undefined}
                            >
                              {messages.actions.delete}
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {canCreate ? (
                    <tr>
                      <td colSpan={plan.years.length + 3} className="px-3 py-1">
                        <Button
                          variant="ghost"
                          onClick={() => setEditing({ line: null, section })}
                          data-testid={`add-line-${section}`}
                        >
                          + {M.addLine(M.sections[section])}
                        </Button>
                      </td>
                    </tr>
                  ) : null}
                  <TotalsRow
                    label={M.sectionTotal(M.sections[section])}
                    totals={plan.sections[section]}
                  />
                </Fragment>
              );
            })}
            <TotalsRow label={M.total} totals={plan.total} testId="budget-total" />
          </tbody>
        </table>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3 rounded-md border border-line p-3">
          <dt>{M.grandTotalBeforeTax}</dt>
          <dd className="font-medium tabular-nums" data-testid="grand-before-tax">
            {formatMoney(plan.total.beforeTax)}
          </dd>
        </div>
        <div className="flex justify-between gap-3 rounded-md border border-line p-3">
          <dt>{M.grandTotalWithTax}</dt>
          <dd className="font-medium tabular-nums" data-testid="grand-with-tax">
            {formatMoney(plan.total.withTax)}
          </dd>
        </div>
      </dl>
      {over !== null ? (
        <p
          role="status"
          className="rounded-md border border-warning bg-warning-soft p-3 text-sm text-ink"
        >
          {M.overAuthorised(formatMoney(over))}
        </p>
      ) : null}

      {editing ? (
        <LineDialog
          key={
            editing.line ? `${editing.line.id}:${editing.line.rowVer}` : `new-${editing.section}`
          }
          sheet={sheet}
          line={editing.line}
          section={editing.section}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title={messages.confirmDelete.title(M.line.toLowerCase(), deleting.description)}
          body={messages.confirmDelete.body}
          confirmLabel={messages.actions.delete}
          pending={action.pending}
          onConfirm={() =>
            action.run(() => deleteLineAction({ lineId: deleting.id, rowVer: deleting.rowVer }), {
              success: messages.feedback.deleted,
              onSuccess: () => setDeleting(null),
            })
          }
        />
      ) : null}
    </div>
  );
}
