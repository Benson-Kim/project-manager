"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { DatePicker, Input, Select } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { createTransactionAction, updateTransactionAction } from "../actions";
import { rateOf } from "../calc/engine";
import { fiscalYearLabel, fiscalYearOf, horizonYears } from "../calc/fiscal";
import { calcProfiles } from "../calc/sheet";
import { applyRate, formatMoney, formatPercent, parseFraction, parseMoney } from "../calc/money";
import type { SheetDto, TransactionDto } from "../schemas/financial";
import { useFinancialAction } from "./use-financial-action";

const M = messages.financials;

/**
 * Record or edit an invoice (ADR-0029). The user types the pre-tax amount; the
 * preview shows what it costs the budget at the rate the server will keep: the
 * line's current tax profile for a new or moved transaction, otherwise the
 * rate captured when it was entered.
 */
export function TransactionDialog({
  sheet,
  transaction,
  lineId,
  open,
  onOpenChange,
}: {
  sheet: SheetDto;
  transaction: TransactionDto | null;
  lineId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const f = sheet.financial;
  const years = horizonYears(f.firstFiscalYear, f.horizonYears);
  const [state, setState] = useState({
    lineId: String(transaction?.lineId ?? lineId ?? sheet.lines[0]?.id ?? ""),
    date: transaction?.date ?? "",
    fiscalYear: transaction ? String(transaction.fiscalYear) : "",
    reference: transaction?.reference ?? "",
    description: transaction?.description ?? "",
    amount: transaction?.amount ?? "",
  });
  const action = useFinancialAction();
  const change = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));

  const derivedYear = fiscalYearOf(state.date, f.startMonth);
  const year = state.fiscalYear ? Number(state.fiscalYear) : derivedYear;
  const rate = useMemo(() => {
    if (
      transaction &&
      String(transaction.lineId) === state.lineId &&
      (year === null || year === transaction.fiscalYear)
    )
      return parseFraction(transaction.taxRate) ?? 0n;
    const line = sheet.lines.find((l) => String(l.id) === state.lineId);
    return rateOf(calcProfiles(sheet), line?.taxProfileId ?? null, year ?? undefined);
  }, [sheet, state.lineId, transaction, year]);
  const cents = parseMoney(state.amount);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const fields = { ...state };
    action.run(
      () =>
        transaction
          ? updateTransactionAction({
              transactionId: transaction.id,
              rowVer: transaction.rowVer,
              ...fields,
            })
          : createTransactionAction(fields),
      {
        success: transaction ? messages.feedback.saved : messages.feedback.created,
        onSuccess: () => onOpenChange(false),
      },
    );
  };
  const err = action.fieldErrors;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        transaction
          ? M.editTransaction(transaction.reference ?? transaction.date)
          : M.addTransaction
      }
    >
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
        <p className="text-sm text-ink-muted tabular-nums" aria-live="polite">
          {M.capturedRate}: {formatPercent(rate)} %
          {cents !== null ? ` · ${M.withTax}: ${formatMoney(applyRate(cents, rate))}` : ""}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {messages.actions.cancel}
          </Button>
          <Button type="submit" pending={action.pending} data-testid="save-transaction">
            {messages.actions.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
