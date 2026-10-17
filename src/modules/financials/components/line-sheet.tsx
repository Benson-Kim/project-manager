"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Combobox } from "@/components/ui/form/combobox";
import { Field } from "@/components/ui/form/field";
import { Input, Select, Switch, Textarea } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { deleteLineAction, updateLineAction } from "../actions";
import { lineAmounts, rateOf, type Section } from "../calc/engine";
import { fiscalYearLabel, horizonYears } from "../calc/fiscal";
import { applyRate, formatMoney, formatMoneyField, parseFraction, parseMoney } from "../calc/money";
import { SECTION_VALUES } from "../schemas/fields";
import type { LineDto, SheetDto } from "../schemas/financial";
import { LabelCombobox } from "./label-combobox";
import { useFinancialAction } from "./use-financial-action";

const M = messages.financials;

/**
 * One budget line in full (ADR-0029), opened from its row in the budget
 * datasheet like every list's record sheet: the fields the grid has no column
 * for (section, supplier, G/L account, comments) with the rest, each year's
 * tax-included preview and, for recurrent lines, the escalated years left
 * blank — the same engine the planner totals with. Deleting is here too.
 */
export function LineSheet({
  sheet,
  line,
  open,
  onOpenChange,
  canEdit,
  canDelete,
  inUse,
}: {
  sheet: SheetDto;
  line: LineDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  canDelete: boolean;
  /** The line has transactions, so it can't be deleted. */
  inUse: boolean;
}) {
  const f = sheet.financial;
  const years = horizonYears(f.firstFiscalYear, f.horizonYears);
  const [state, setState] = useState(() => ({
    section: line.section,
    description: line.description,
    costCategory: line.costCategory ?? "",
    fundingSource: line.fundingSource ?? "",
    supplier: line.supplier ?? "",
    glAccount: line.glAccount ?? "",
    taxProfileId: String(line.taxProfileId ?? ""),
    isRecurrent: line.isRecurrent,
    comments: line.comments ?? "",
    amounts: Object.fromEntries(
      years.map((y) => [y, formatMoneyField(line.amounts[y] ?? "")]),
    ) as Record<number, string>,
  }));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const action = useFinancialAction();
  const change = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));

  const preview = useMemo(() => {
    const typed = new Map<number, bigint>();
    for (const [year, text] of Object.entries(state.amounts)) {
      const cents = text.trim() ? parseMoney(text) : null;
      if (cents !== null && cents >= 0n) typed.set(Number(year), cents);
    }
    const profiles = sheet.profiles.map((p) => ({
      id: p.id,
      rateMicros: parseFraction(p.rate) ?? 0n,
      steps: p.steps.map((s) => ({
        fromFiscalYear: s.fromFiscalYear,
        rateMicros: parseFraction(s.rate) ?? 0n,
      })),
    }));
    const profileId = state.taxProfileId ? Number(state.taxProfileId) : null;
    const amounts = lineAmounts(
      {
        id: 0,
        section: state.section,
        taxProfileId: null,
        isRecurrent: state.isRecurrent,
        amounts: typed,
      },
      years,
      parseFraction(f.escalationRate) ?? 0n,
    );
    return new Map(
      amounts.map((a) => [
        a.fiscalYear,
        { ...a, withTax: applyRate(a.beforeTax, rateOf(profiles, profileId, a.fiscalYear)) },
      ]),
    );
  }, [
    state.amounts,
    state.taxProfileId,
    state.isRecurrent,
    state.section,
    sheet.profiles,
    f.escalationRate,
    years,
  ]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    action.run(
      () =>
        updateLineAction({
          lineId: line.id,
          rowVer: line.rowVer,
          section: state.section,
          description: state.description,
          costCategory: state.costCategory,
          fundingSource: state.fundingSource,
          supplier: state.supplier,
          glAccount: state.glAccount,
          taxProfileId: state.taxProfileId,
          isRecurrent: state.isRecurrent,
          comments: state.comments,
          amounts: years
            .filter((y) => state.amounts[y]!.trim() !== "")
            .map((y) => ({ fiscalYear: y, amount: state.amounts[y]! })),
        }),
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const remove = () =>
    action.run(() => deleteLineAction({ lineId: line.id, rowVer: line.rowVer }), {
      success: messages.feedback.deleted,
      onSuccess: () => {
        setConfirmDelete(false);
        onOpenChange(false);
      },
    });

  const err = action.fieldErrors;
  const yearError = (i: number) => {
    const index = years.filter((y) => state.amounts[y]!.trim() !== "").indexOf(years[i]!);
    return index >= 0 ? err[`amounts.${index}.amount`] : undefined;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={M.editLine(line.description)}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4" data-testid="line-form">
        <ErrorSummary message={action.summary} />
        {action.conflict ? (
          <Button variant="secondary" onClick={action.reload}>
            {M.reload}
          </Button>
        ) : null}
        <fieldset disabled={!canEdit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={M.section} name="section">
              <Select
                value={state.section}
                onChange={(e) => change({ section: e.target.value as Section })}
              >
                {SECTION_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {M.sections[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={M.description} name="description" errors={err.description}>
              <Input
                value={state.description}
                maxLength={255}
                onChange={(e) => change({ description: e.target.value })}
              />
            </Field>
            <Field label={M.costCategory} name="costCategory" errors={err.costCategory}>
              <LabelCombobox
                name="costCategory"
                labels={f.costCategories}
                value={state.costCategory}
                onChange={(costCategory) => change({ costCategory })}
              />
            </Field>
            <Field label={M.fundingSource} name="fundingSource" errors={err.fundingSource}>
              <LabelCombobox
                name="fundingSource"
                labels={f.fundingSources}
                value={state.fundingSource}
                onChange={(fundingSource) => change({ fundingSource })}
              />
            </Field>
            <Field label={M.supplier} name="supplier" errors={err.supplier}>
              <Input
                value={state.supplier}
                maxLength={255}
                onChange={(e) => change({ supplier: e.target.value })}
              />
            </Field>
            <Field label={M.glAccount} name="glAccount" errors={err.glAccount}>
              <Input
                value={state.glAccount}
                maxLength={100}
                spellCheck={false}
                onChange={(e) => change({ glAccount: e.target.value })}
              />
            </Field>
            <Field label={M.taxProfile} name="taxProfileId" errors={err.taxProfileId}>
              <Combobox
                name="taxProfileId"
                options={[
                  { value: "", label: M.noTax },
                  ...sheet.profiles.map((p) => ({ value: String(p.id), label: p.name })),
                ]}
                defaultValue={state.taxProfileId}
                onSelect={(option) => change({ taxProfileId: option?.value ?? "" })}
              />
            </Field>
            <Switch
              label={M.recurrent}
              checked={state.isRecurrent}
              onChange={(e) => change({ isRecurrent: e.target.checked })}
            />
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-ink">{M.beforeTax}</legend>
            {years.map((year, i) => {
              const cell = preview.get(year);
              const escalated = cell?.source === "escalated";
              return (
                <div key={year} className="grid grid-cols-[1fr_auto] items-end gap-3">
                  <Field
                    label={fiscalYearLabel(year, f.startMonth)}
                    name={`amounts.${year}`}
                    errors={yearError(i)}
                  >
                    <Input
                      inputMode="decimal"
                      value={state.amounts[year]}
                      placeholder={escalated ? formatMoney(cell.beforeTax) : ""}
                      onChange={(e) =>
                        change({ amounts: { ...state.amounts, [year]: e.target.value } })
                      }
                    />
                  </Field>
                  <p
                    className="min-h-10 py-2 text-right text-sm text-ink-muted tabular-nums"
                    aria-live="polite"
                  >
                    {cell && cell.source !== "none"
                      ? `${M.withTax}: ${formatMoney(cell.withTax)}`
                      : ""}
                    {escalated ? <span className="block text-xs">{M.escalated}</span> : null}
                  </p>
                </div>
              );
            })}
          </fieldset>

          <Field label={M.comments} name="comments" errors={err.comments}>
            <Textarea
              rows={2}
              value={state.comments}
              maxLength={1000}
              onChange={(e) => change({ comments: e.target.value })}
            />
          </Field>
        </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Button type="submit" pending={action.pending} data-testid="save-line">
              {messages.actions.save}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {messages.actions.cancel}
          </Button>
          {canDelete ? (
            <Button
              variant="danger"
              data-testid="delete-line"
              disabled={inUse}
              title={inUse ? M.lineInUse : undefined}
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
        title={messages.confirmDelete.title(M.line.toLowerCase(), line.description)}
        body={messages.confirmDelete.body}
        confirmLabel={messages.actions.delete}
        pending={action.pending}
        onConfirm={remove}
      />
    </Sheet>
  );
}
