"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { booleanColumn, choiceColumn, textColumn } from "@/components/ui/data-view/columns";
import { cellClass, DatasheetAddRow, IconButton } from "@/components/ui/data-view/datasheet-cells";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { Dialog } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Panel } from "@/components/ui/panel";
import type { ActionResult } from "@/lib/action";
import { messages } from "@/lib/messages";
import { createLineAction, moveLineAction, updateLineAction } from "../actions";
import { SECTIONS, type PlanCell, type Section, type Totals } from "../calc/engine";
import { fiscalYearLabel } from "../calc/fiscal";
import { formatMoney, formatMoneyField, parseMoney } from "../calc/money";
import { calculateSheet } from "../calc/sheet";
import type { LineDto, SheetDto } from "../schemas/financial";
import { LabelListDialog, type FinancialList } from "./label-list-dialog";
import { DatasheetTable, RecordRow, useDatasheetFeedback, useSavedRows } from "./datasheet-table";
import { amountField, cellErrors, lineValues, newLineValues, withCell } from "./line-cells";
import { LineSheet } from "./line-sheet";
import { TaxProfilesForm } from "./settings-panel";
import { useFinancialAction } from "./use-financial-action";

const M = messages.financials;
const P = M.placeholders.line;
const lineId = (line: LineDto) => line.id;

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

/** A year cell's hover note: its tax-included amount, and whether it was escalated. */
function cellNote(cell: PlanCell | undefined): string | undefined {
  if (!cell || cell.source === "none") return undefined;
  const withTax = `${M.withTax}: ${formatMoney(cell.withTax)}`;
  return cell.source === "escalated" ? `${M.escalated} · ${withTax}` : withTax;
}

function TotalsRow({
  label,
  labelHidden = false,
  totals,
  span,
  testId,
}: {
  label: string;
  /** A section's totals read as such under its lines; the label is for screen readers. */
  labelHidden?: boolean;
  totals: Totals;
  /** The columns before the years. */
  span: number;
  testId?: string;
}) {
  return (
    <tr className="bg-surface-raised font-medium" data-testid={testId}>
      <th scope="row" colSpan={span} className={`${cellClass} text-left`}>
        <span className={labelHidden ? "sr-only" : undefined}>{label}</span>
      </th>
      {totals.byYear.map((y) => (
        <td key={y.fiscalYear} className={cellClass}>
          <Amounts beforeTax={y.beforeTax} withTax={y.withTax} />
        </td>
      ))}
      <td className={cellClass}>
        <Amounts beforeTax={totals.beforeTax} withTax={totals.withTax} />
      </td>
      <td className={cellClass} />
    </tr>
  );
}

/**
 * The budget planner (ADR-0029, the workbook's Budget Execution tab), a
 * datasheet like every list's (ADR-0023): each line's cells are edited where
 * they are, and saved as they are left; each section ends with a new-entry
 * row. Cost category, source of financing and tax end with "Edit list…" (and
 * their headers carry the caret), as list-bound columns do elsewhere. A line's
 * remaining fields and Delete are in its sheet (↗). Every fiscal year's
 * pre-tax amount is typed in its cell; totals show it over its tax-included
 * amount, from the shared engine, with the gap to the authorised budget.
 */
export function BudgetPlanner({
  sheet,
  canCreate,
  canEdit,
  canDelete,
  canEditTax = false,
}: {
  sheet: SheetDto;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** financial-tax-invoices:update: the tax column's "Edit list…" edits the tax profiles. */
  canEditTax?: boolean;
}) {
  const feedback = useDatasheetFeedback();
  const f = sheet.financial;
  const action = useFinancialAction();
  const [openId, setOpenId] = useState<number | null>(null);
  const [editingList, setEditingList] = useState<FinancialList | "tax" | null>(null);

  const [lines, keepLine] = useSavedRows(sheet.lines, lineId);
  const { plan } = useMemo(() => calculateSheet({ ...sheet, lines }), [sheet, lines]);
  const years = plan.years;

  const withTransactions = new Set(sheet.transactions.map((t) => t.lineId));
  const authorised = f.budget ? parseMoney(f.budget) : null;
  const planned = f.budgetIncludesTax ? plan.total.withTax : plan.total.beforeTax;
  const over = authorised !== null && planned > authorised ? planned - authorised : null;
  const opened = openId === null ? undefined : lines.find((line) => line.id === openId);

  const labelChoices = (labels: readonly string[]) =>
    labels.map((label) => ({ value: label, label }));
  const columns: DataViewColumn<LineDto>[] = [
    textColumn({
      key: "description",
      header: M.description,
      priority: 1,
      field: "description",
      value: (line) => line.description,
      placeholder: P.description,
      maxLength: 255,
    }),
    choiceColumn({
      key: "costCategory",
      header: M.costCategory,
      priority: 1,
      field: "costCategory",
      value: (line) => line.costCategory,
      choices: labelChoices(f.costCategories),
      placeholder: P.costCategory,
      editList: canEdit ? () => setEditingList("costCategories") : undefined,
    }),
    choiceColumn({
      key: "fundingSource",
      header: M.fundingSource,
      priority: 1,
      field: "fundingSource",
      value: (line) => line.fundingSource,
      choices: labelChoices(f.fundingSources),
      placeholder: P.fundingSource,
      editList: canEdit ? () => setEditingList("fundingSources") : undefined,
    }),
    choiceColumn({
      key: "taxProfileId",
      header: M.taxProfile,
      priority: 1,
      field: "taxProfileId",
      value: (line) => (line.taxProfileId === null ? null : String(line.taxProfileId)),
      choices: sheet.profiles.map((p) => ({ value: String(p.id), label: p.name })),
      emptyLabel: M.noTax,
      initial: sheet.profiles[0] ? String(sheet.profiles[0].id) : "",
      placeholder: P.tax,
      editList: canEditTax ? () => setEditingList("tax") : undefined,
    }),
    booleanColumn({
      key: "isRecurrent",
      header: M.recurrent,
      priority: 1,
      field: "isRecurrent",
      value: (line) => line.isRecurrent,
      yes: M.recurrentYes,
      no: M.recurrentNo,
      placeholder: P.recurrent,
    }),
    ...years.map((year, i): DataViewColumn<LineDto> => ({
      key: `y${year}`,
      header: fiscalYearLabel(year, f.startMonth),
      priority: 1,
      render: (line) => {
        const cell = plan.lines.get(line.id)?.cells[i];
        return cell ? (
          <Amounts
            beforeTax={cell.beforeTax}
            withTax={cell.withTax}
            muted={cell.source === "escalated"}
          />
        ) : null;
      },
      edit: {
        kind: "text",
        numeric: true,
        field: amountField(year),
        value: (line) => formatMoneyField(line.amounts[year] ?? ""),
        placeholder: P.amount,
        maxLength: 24,
        ghost: (line) => {
          const cell = plan.lines.get(line.id)?.cells[i];
          return cell?.source === "escalated" ? formatMoney(cell.beforeTax) : undefined;
        },
      },
    })),
    {
      key: "total",
      header: M.total,
      priority: 1,
      render: (line) => {
        const total = plan.lines.get(line.id);
        return total ? <Amounts beforeTax={total.beforeTax} withTax={total.withTax} /> : null;
      },
    },
  ];
  const leading = columns.length - years.length - 1;
  const rowLabel = (line: LineDto) => line.description || M.line;

  /** One cell, sent with the rest of the line as it is (the sheet's update action). */
  const saveCell = async (line: LineDto, column: DataViewColumn<LineDto>, value: string) => {
    const next = withCell(line, column.edit!.field, value);
    const result = await updateLineAction({
      lineId: line.id,
      rowVer: line.rowVer,
      ...lineValues(next, years),
    });
    if (!result.ok) {
      feedback.failed(result.error);
      return false;
    }
    keepLine({ ...next, rowVer: result.data.rowVer });
    feedback.saved(column.header);
    return true;
  };

  const addLine =
    (section: Section) =>
    async (draft: Record<string, string>): Promise<ActionResult<unknown>> => {
      const values = newLineValues(section, draft, years);
      const result = await createLineAction({ financialId: f.id, ...values });
      if (result.ok) {
        feedback.added();
        return result;
      }
      feedback.failed(result.error);
      return {
        ok: false,
        error: { ...result.error, fieldErrors: cellErrors(result.error.fieldErrors, values) },
      };
    };

  const move = (line: LineDto, direction: "up" | "down") =>
    action.run(() => moveLineAction({ lineId: line.id, direction, rowVer: line.rowVer }));

  return (
    <Panel id="budget-heading" title={M.budgetTab} testId="budget-planner">
      <ErrorSummary message={action.summary} />
      {action.conflict ? (
        <Button variant="secondary" onClick={action.reload}>
          {M.reload}
        </Button>
      ) : null}
      <p className="text-sm text-ink-muted">
        {M.beforeTax} / <span className="text-xs">{M.withTax}</span>
      </p>
      <DatasheetTable label={M.budgetTab} columns={columns}>
        {SECTIONS.map((section) => {
          const sectionLines = lines.filter((line) => line.section === section);
          return (
            <tbody key={section} data-testid={`budget-section-${section}`}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={columns.length + 1}
                  className={`${cellClass} text-left font-semibold`}
                >
                  {M.sections[section]}
                </th>
              </tr>
              {sectionLines.map((line, index) => (
                <RecordRow
                  key={line.id}
                  row={line}
                  columns={columns}
                  editable={canEdit}
                  label={rowLabel(line)}
                  cellTitle={(column) => {
                    const i = columns.indexOf(column) - leading;
                    return i >= 0 && i < years.length
                      ? cellNote(plan.lines.get(line.id)?.cells[i])
                      : undefined;
                  }}
                  onSave={(column, value) => saveCell(line, column, value)}
                  onOpen={() => setOpenId(line.id)}
                  testId="budget-line"
                  actions={
                    canEdit ? (
                      <>
                        <IconButton
                          label={M.moveUp(rowLabel(line))}
                          disabled={index === 0 || action.pending}
                          onClick={() => move(line, "up")}
                        >
                          <path d="M4 10l4-4 4 4" />
                        </IconButton>
                        <IconButton
                          label={M.moveDown(rowLabel(line))}
                          disabled={index === sectionLines.length - 1 || action.pending}
                          onClick={() => move(line, "down")}
                        >
                          <path d="M4 6l4 4 4-4" />
                        </IconButton>
                      </>
                    ) : null
                  }
                />
              ))}
              {canCreate ? (
                <DatasheetAddRow
                  columns={columns}
                  hasSelectColumn={false}
                  columnStyle={() => undefined}
                  onAdd={addLine(section)}
                />
              ) : null}
              <TotalsRow
                label={M.sectionTotal(M.sections[section])}
                labelHidden
                totals={plan.sections[section]}
                span={leading}
              />
            </tbody>
          );
        })}
        <tbody>
          <TotalsRow label={M.total} totals={plan.total} span={leading} testId="budget-total" />
        </tbody>
      </DatasheetTable>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3 rounded-md border border-line bg-surface p-3">
          <dt>{M.grandTotalBeforeTax}</dt>
          <dd className="font-medium tabular-nums" data-testid="grand-before-tax">
            {formatMoney(plan.total.beforeTax)}
          </dd>
        </div>
        <div className="flex justify-between gap-3 rounded-md border border-line bg-surface p-3">
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

      {opened ? (
        <LineSheet
          key={`${opened.id}:${opened.rowVer}`}
          sheet={sheet}
          line={opened}
          open
          onOpenChange={(open) => !open && setOpenId(null)}
          canEdit={canEdit}
          canDelete={canDelete}
          inUse={withTransactions.has(opened.id)}
        />
      ) : null}
      {editingList === "costCategories" || editingList === "fundingSources" ? (
        <LabelListDialog
          sheet={sheet}
          list={editingList}
          column={editingList === "costCategories" ? M.costCategory : M.fundingSource}
          open
          onOpenChange={(next) => !next && setEditingList(null)}
        />
      ) : null}
      <Dialog
        open={editingList === "tax"}
        onOpenChange={(next) => !next && setEditingList(null)}
        title={M.taxProfiles}
        wide
      >
        {editingList === "tax" ? (
          <TaxProfilesForm
            sheet={sheet}
            canEdit={canEditTax}
            framed={false}
            onSaved={() => setEditingList(null)}
          />
        ) : null}
      </Dialog>
    </Panel>
  );
}
