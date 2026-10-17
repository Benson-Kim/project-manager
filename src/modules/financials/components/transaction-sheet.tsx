"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { DatePicker, Input, Select } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { deleteTransactionAction, updateTransactionAction } from "../actions";
import { rateOf } from "../calc/engine";
import { fiscalYearLabel, fiscalYearOf, horizonYears } from "../calc/fiscal";
import { calcProfiles } from "../calc/sheet";
import {
  applyRate,
  formatMoney,
  formatMoneyField,
  formatPercent,
  parseFraction,
  parseMoney,
} from "../calc/money";
import type { SheetDto, TransactionDto } from "../schemas/financial";
import { useFinancialAction } from "./use-financial-action";

const M = messages.financials;

/**
 * One invoice in full (ADR-0029), opened from its row in the transactions
 * datasheet like every list's record sheet. The user types the pre-tax amount;
 * the preview shows what it costs the budget at the rate the server will keep:
 * the line's current tax profile for a moved transaction, otherwise the rate
 * captured when it was entered. Deleting is here too.
 */
export function TransactionSheet({
  sheet,
  transaction,
  open,
  onOpenChange,
  canEdit,
  canDelete,
}: {
  sheet: SheetDto;
  transaction: TransactionDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const f = sheet.financial;
  const years = horizonYears(f.firstFiscalYear, f.horizonYears);
  const [state, setState] = useState({
    lineId: String(transaction.lineId),
    date: transaction.date,
    fiscalYear: String(transaction.fiscalYear),
    reference: transaction.reference ?? "",
    description: transaction.description ?? "",
    amount: formatMoneyField(transaction.amount),
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const action = useFinancialAction();
  const change = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));

  const derivedYear = fiscalYearOf(state.date, f.startMonth);
  const year = state.fiscalYear ? Number(state.fiscalYear) : derivedYear;
  const rate = useMemo(() => {
    if (
      String(transaction.lineId) === state.lineId &&
      (year === null || year === transaction.fiscalYear)
    )
      return parseFraction(transaction.taxRate) ?? 0n;
    const line = sheet.lines.find((l) => String(l.id) === state.lineId);
    return rateOf(calcProfiles(sheet), line?.taxProfileId ?? null, year ?? undefined);
  }, [sheet, state.lineId, transaction, year]);
  const cents = parseMoney(state.amount);
  const name = transaction.reference ?? transaction.date;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    action.run(
      () =>
        updateTransactionAction({
          transactionId: transaction.id,
          rowVer: transaction.rowVer,
          ...state,
        }),
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const remove = () =>
    action.run(
      () => deleteTransactionAction({ transactionId: transaction.id, rowVer: transaction.rowVer }),
      {
        success: messages.feedback.deleted,
        onSuccess: () => {
          setConfirmDelete(false);
          onOpenChange(false);
        },
      },
    );
  const err = action.fieldErrors;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={M.editTransaction(name)}>
      <form
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-4"
        data-testid="transaction-form"
      >
        <ErrorSummary message={action.summary} />
        {action.conflict ? (
          <Button variant="secondary" onClick={action.reload}>
            {M.reload}
          </Button>
        ) : null}
        <fieldset disabled={!canEdit} className="flex flex-col gap-4">
          <Field label={M.line} name="lineId" errors={err.lineId}>
            <Select value={state.lineId} onChange={(e) => change({ lineId: e.target.value })}>
              {sheet.lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.description}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={M.date} name="date" errors={err.date}>
              <DatePicker value={state.date} onChange={(e) => change({ date: e.target.value })} />
            </Field>
            <Field label={M.fiscalYear} name="fiscalYear" errors={err.fiscalYear}>
              <Select
                value={state.fiscalYear}
                onChange={(e) => change({ fiscalYear: e.target.value })}
              >
                <option value="">
                  {M.fiscalYearAuto}
                  {derivedYear ? ` (${fiscalYearLabel(derivedYear, f.startMonth)})` : ""}
                </option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {fiscalYearLabel(y, f.startMonth)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={M.reference} name="reference" errors={err.reference}>
              <Input
                value={state.reference}
                maxLength={100}
                spellCheck={false}
                onChange={(e) => change({ reference: e.target.value })}
              />
            </Field>
            <Field label={M.amountBeforeTax} name="amount" errors={err.amount}>
              <Input
                inputMode="decimal"
                value={state.amount}
                onChange={(e) => change({ amount: e.target.value })}
              />
            </Field>
          </div>
          <Field label={M.description} name="description" errors={err.description}>
            <Input
              value={state.description}
              maxLength={255}
              onChange={(e) => change({ description: e.target.value })}
            />
          </Field>
        </fieldset>
        <p className="text-sm text-ink-muted tabular-nums" aria-live="polite">
          {M.capturedRate}: {formatPercent(rate)} %
          {cents !== null ? ` · ${M.withTax}: ${formatMoney(applyRate(cents, rate))}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Button type="submit" pending={action.pending} data-testid="save-transaction">
              {messages.actions.save}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {messages.actions.cancel}
          </Button>
          {canDelete ? (
            <Button
              variant="danger"
              data-testid="delete-transaction"
              onClick={() => setConfirmDelete(true)}
            >
              {messages.actions.delete}
            </Button>
          ) : null}
        </div>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={M.deleteTransaction(name)}
        body={messages.confirmDelete.body}
        confirmLabel={messages.actions.delete}
        pending={action.pending}
        onConfirm={remove}
      />
    </Sheet>
  );
}
