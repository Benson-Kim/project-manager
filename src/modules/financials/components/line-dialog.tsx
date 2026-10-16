"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Select, Switch, Textarea } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { createLineAction, updateLineAction } from "../actions";
import { lineAmounts, rateOf } from "../calc/engine";
import { fiscalYearLabel, horizonYears } from "../calc/fiscal";
import { applyRate, formatMoney, parseFraction, parseMoney } from "../calc/money";
import type { Section } from "../calc/engine";
import { SECTION_VALUES } from "../schemas/fields";
import type { LineDto, SheetDto } from "../schemas/financial";
import { useFinancialAction } from "./use-financial-action";

const M = messages.financials;

/**
 * Add or edit one budget line with all its years at once (ADR-0029): the
 * dialog previews each year's tax-included amount and, for recurrent lines,
 * the escalated years left blank — the same engine the planner totals with.
 */
export function LineDialog({
  sheet,
  line,
  section,
  open,
  onOpenChange,
}: {
  sheet: SheetDto;
  line: LineDto | null;
  section: Section;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const f = sheet.financial;
  const years = horizonYears(f.firstFiscalYear, f.horizonYears);
  const [state, setState] = useState(() => ({
    section: line?.section ?? section,
    description: line?.description ?? "",
    costCategory: line?.costCategory ?? "",
    fundingSource: line?.fundingSource ?? "",
    supplier: line?.supplier ?? "",
    glAccount: line?.glAccount ?? "",
    taxProfileId: line ? String(line.taxProfileId ?? "") : String(sheet.profiles[0]?.id ?? ""),
    isRecurrent: line?.isRecurrent ?? false,
    comments: line?.comments ?? "",
    amounts: Object.fromEntries(years.map((y) => [y, line?.amounts[y] ?? ""])) as Record<
      number,
      string
    >,
  }));
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
    const fields = {
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
    };
    action.run(
      () =>
        line
          ? updateLineAction({ lineId: line.id, rowVer: line.rowVer, ...fields })
          : createLineAction({ financialId: f.id, ...fields }),
      {
        success: line ? messages.feedback.saved : messages.feedback.created,
        onSuccess: () => onOpenChange(false),
      },
    );
  };

  const err = action.fieldErrors;
  const yearError = (i: number) => {
    const index = years.filter((y) => state.amounts[y]!.trim() !== "").indexOf(years[i]!);
    return index >= 0 ? err[`amounts.${index}.amount`] : undefined;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={line ? M.editLine(line.description) : M.addLine(M.sections[state.section])}
      wide
    >
      <form
        noValidate
        onSubmit={submit}
        className="flex max-h-[75dvh] flex-col gap-4 overflow-y-auto pr-1"
        data-testid="line-form"
      >
        <ErrorSummary message={action.summary} />
        {action.conflict ? (
          <Button variant="secondary" onClick={action.reload}>
            {M.reload}
          </Button>
        ) : null}
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
            <Input
              list="line-categories"
              value={state.costCategory}
              maxLength={150}
              onChange={(e) => change({ costCategory: e.target.value })}
            />
          </Field>
          <Field label={M.fundingSource} name="fundingSource" errors={err.fundingSource}>
            <Input
              list="line-sources"
              value={state.fundingSource}
              maxLength={150}
              onChange={(e) => change({ fundingSource: e.target.value })}
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
            <Select
              value={state.taxProfileId}
              onChange={(e) => change({ taxProfileId: e.target.value })}
            >
              <option value="">{M.noTax}</option>
              {sheet.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Switch
            label={M.recurrent}
            checked={state.isRecurrent}
            onChange={(e) => change({ isRecurrent: e.target.checked })}
          />
        </div>
        <datalist id="line-categories">
          {f.costCategories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id="line-sources">
          {f.fundingSources.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

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
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {messages.actions.cancel}
          </Button>
          <Button type="submit" pending={action.pending} data-testid="save-line">
            {messages.actions.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
