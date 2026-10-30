"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Select, Switch } from "@/components/ui/form/inputs";
import { LabelListEditor } from "@/components/ui/form/label-list-editor";
import { useUnsavedChangesGuard } from "@/components/ui/form/use-unsaved-changes-guard";
import { Panel } from "@/components/ui/panel";
import { NO_CURRENCY, listCurrencies, suggestedCurrency } from "@/lib/currency/currencies";
import { messages } from "@/lib/messages";
import { deleteFinancialAction, setTaxProfilesAction, updateFinancialAction } from "../actions";
import { fiscalYearLabel, horizonYears } from "../calc/fiscal";
import { formatPercent, parseFraction } from "../calc/money";
import { ratesByYear, sameEveryYear, stepsFromRates } from "../calc/tax-rates";
import type { SheetDto } from "../schemas/financial";
import { MONTHS } from "./months";
import { useFinancialAction } from "./use-financial-action";

const M = messages.financials;
const percentOf = (fraction: string) => formatPercent(parseFraction(fraction) ?? 0n);

/** The breakdown form's values from a financial: what updateFinancialAction takes, as typed. */
export function breakdownValues(f: SheetDto["financial"]) {
  return {
    title: f.title,
    projectNumber: f.projectNumber === null ? "" : String(f.projectNumber),
    budgetEnvelope: f.budgetEnvelope ?? "",
    budget: f.budget ?? "",
    budgetIncludesTax: f.budgetIncludesTax,
    recurrentFees: f.recurrentFees ?? "",
    glGrandLivre: f.glGrandLivre ?? "",
    acquisition: f.acquisition ?? "",
    spendBy: f.spendBy ?? "",
    contractTimeframe: f.contractTimeframe ?? "",
    firstFiscalYear: String(f.firstFiscalYear),
    horizonYears: String(f.horizonYears),
    startMonth: String(f.startMonth),
    escalationRate: percentOf(f.escalationRate),
    flagThresholdRate: percentOf(f.flagThresholdRate),
    costCategories: f.costCategories,
    fundingSources: f.fundingSources,
    currency: f.currency,
  };
}

/** Nothing to subscribe to: the viewer's zone does not change while the panel is open. */
const noSubscription = () => () => {};

/**
 * The currency to offer first, resolved on the client only: it reads the
 * viewer's time zone, which the server cannot know, so deciding it during
 * render would differ between the two and drift on hydration. The server
 * snapshot is "no symbol", and React swaps in the real one after hydrating.
 */
function useSuggestedCurrency() {
  return useSyncExternalStore(noSubscription, suggestedCurrency, () => NO_CURRENCY);
}

/** The currency figures are shown in (ADR-0051), or no symbol at all. */
function CurrencyField({
  value,
  errors,
  onChange,
}: {
  value: string;
  errors: string[] | undefined;
  onChange: (currency: string) => void;
}) {
  const suggested = useSuggestedCurrency();
  const currencies = listCurrencies();
  const option = (code: string, name: string) => (
    <option key={code} value={code}>
      {M.currencyOption(name, code)}
    </option>
  );
  return (
    <Field label={M.currency} name="currency" errors={errors}>
      <Select value={value} onChange={(e) => onChange(e.target.value)} data-testid="currency">
        <option value={NO_CURRENCY}>{M.currencyNone}</option>
        {suggested === NO_CURRENCY ? null : (
          <optgroup label={M.currencySuggested}>
            {option(suggested, currencies.find((c) => c.code === suggested)?.name ?? suggested)}
          </optgroup>
        )}
        <optgroup label={M.currencyAll}>
          {currencies.map((currency) => option(currency.code, currency.name))}
        </optgroup>
      </Select>
    </Field>
  );
}

/**
 * A financial's own settings (ADR-0029): the PPTX "Financial breakdown"
 * fields, the calculator parameters and lists, and its tax profiles. All are
 * this financial's copy; the master template is never touched from here.
 */
export function SettingsPanel({
  sheet,
  canEdit,
  canDelete,
  canEditTax,
}: {
  sheet: SheetDto;
  canEdit: boolean;
  canDelete: boolean;
  /** Section "financial-tax-invoices" (update): tax profiles are kept apart from the budget. */
  canEditTax: boolean;
}) {
  return (
    <div className="flex flex-col gap-6" data-testid="settings-panel">
      <BreakdownForm sheet={sheet} canEdit={canEdit} />
      <TaxProfilesForm sheet={sheet} canEdit={canEditTax} />
      {canDelete ? <DeleteFinancial sheet={sheet} /> : null}
    </div>
  );
}

function BreakdownForm({ sheet, canEdit }: { sheet: SheetDto; canEdit: boolean }) {
  const f = sheet.financial;
  const [state, setState] = useState(() => breakdownValues(f));
  const [dirty, setDirty] = useState(false);
  const action = useFinancialAction();
  useUnsavedChangesGuard(dirty);
  const change = (patch: Partial<typeof state>) => {
    setState((s) => ({ ...s, ...patch }));
    setDirty(true);
  };
  const err = action.fieldErrors;

  const text = (
    key: Exclude<
      keyof typeof state,
      "budgetIncludesTax" | "costCategories" | "fundingSources" | "currency"
    >,
    label: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <Field label={label} name={key} errors={err[key]}>
      <Input value={state[key]} onChange={(e) => change({ [key]: e.target.value })} {...extra} />
    </Field>
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const first = Number(state.firstFiscalYear);
    const last = first + Number(state.horizonYears) - 1;
    const used = [
      ...sheet.lines.flatMap((l) => Object.keys(l.amounts).map(Number)),
      ...sheet.transactions.map((t) => t.fiscalYear),
    ];
    if (Number.isInteger(first) && used.some((year) => year < first || year > last)) {
      action.setSummary(M.yearsInUse);
      action.setFieldErrors({ horizonYears: [M.yearsInUse], firstFiscalYear: [M.yearsInUse] });
      return;
    }
    action.run(
      () =>
        updateFinancialAction({
          financialId: f.id,
          rowVer: f.rowVer,
          ...state,
        }),
      { onSuccess: () => setDirty(false) },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4" data-testid="breakdown-form">
      <ErrorSummary message={action.summary} />
      {action.conflict ? (
        <Button variant="secondary" onClick={action.reload}>
          {M.reload}
        </Button>
      ) : null}
      <fieldset disabled={!canEdit || action.pending} className="flex flex-col gap-6">
        <Panel id="fin-breakdown" title={M.breakdown}>
          {text("title", M.titleLabel, { maxLength: 150 })}
          <div className="grid gap-4 sm:grid-cols-2">
            {text("projectNumber", M.projectNumber, { inputMode: "numeric" })}
            {text("budgetEnvelope", M.budgetEnvelope, { maxLength: 255 })}
            {text("budget", M.budget, { inputMode: "decimal" })}
            <Switch
              label={M.budgetIncludesTax}
              checked={state.budgetIncludesTax}
              onChange={(e) => change({ budgetIncludesTax: e.target.checked })}
              className="self-end"
            />
            {text("recurrentFees", M.recurrentFees, { inputMode: "decimal" })}
            {text("glGrandLivre", M.glGrandLivre, { maxLength: 255, spellCheck: false })}
            {text("acquisition", M.acquisition, { maxLength: 255 })}
            {text("spendBy", M.spendBy, { maxLength: 255 })}
            {text("contractTimeframe", M.contractTimeframe, { maxLength: 255 })}
          </div>
        </Panel>
        <Panel id="fin-settings" title={M.parameters}>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("firstFiscalYear", M.firstFiscalYear, {
              type: "number",
              inputMode: "numeric",
              min: 2000,
              max: 2100,
            })}
            <Field label={M.horizonYears} name="horizonYears" errors={err.horizonYears}>
              <Select
                value={state.horizonYears}
                onChange={(e) => change({ horizonYears: e.target.value })}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={M.startMonth} name="startMonth" errors={err.startMonth}>
              <Select
                value={state.startMonth}
                onChange={(e) => change({ startMonth: e.target.value })}
              >
                {MONTHS.map((month, i) => (
                  <option key={month} value={i + 1}>
                    {month}
                  </option>
                ))}
              </Select>
            </Field>
            <CurrencyField
              value={state.currency}
              errors={err.currency}
              onChange={(currency) => change({ currency })}
            />
            {text("escalationRate", M.escalationRate, { inputMode: "decimal" })}
            {text("flagThresholdRate", M.flagThreshold, { inputMode: "decimal" })}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <LabelListEditor
              legend={M.costCategories}
              labels={f.costCategories}
              maxLength={150}
              errors={err.costCategories}
              onChange={(costCategories) => change({ costCategories })}
              testId="cost-categories"
            />
            <LabelListEditor
              legend={M.fundingSources}
              labels={f.fundingSources}
              maxLength={150}
              errors={err.fundingSources}
              onChange={(fundingSources) => change({ fundingSources })}
              testId="funding-sources"
            />
          </div>
        </Panel>
      </fieldset>
      {canEdit ? (
        <div>
          <Button type="submit" pending={action.pending} data-testid="save-breakdown">
            {messages.actions.save}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

/**
 * The financial's tax profiles (ADR-0029): a name and its rate for every fiscal
 * year, typed as one rate when it is the same every year or as a small table of
 * year and rate. Saved as a rate and the years it changes from (calc/tax-rates).
 * `framed` shows it as a Panel (the settings); the line dialog opens it bare.
 */
export function TaxProfilesForm({
  sheet,
  canEdit,
  framed = true,
  onSaved,
}: {
  sheet: SheetDto;
  canEdit: boolean;
  framed?: boolean;
  onSaved?: () => void;
}) {
  const f = sheet.financial;
  const years = horizonYears(f.firstFiscalYear, f.horizonYears);
  const [profiles, setProfiles] = useState(() =>
    sheet.profiles.map((p) => {
      const rates = ratesByYear(
        percentOf(p.rate),
        p.steps.map((s) => ({ fromFiscalYear: s.fromFiscalYear, rate: percentOf(s.rate) })),
        years,
      );
      return { id: p.id as number | null, name: p.name, same: sameEveryYear(rates), rates };
    }),
  );
  const action = useFinancialAction();
  const used = new Set(sheet.lines.map((l) => l.taxProfileId));
  type Profile = (typeof profiles)[number];
  const change = (i: number, patch: Partial<Profile>) =>
    setProfiles((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const changeRate = (i: number, k: number, rate: string) =>
    change(i, { rates: profiles[i]!.rates.map((r, m) => (m === k ? rate : r)) });
  const err = (path: string) => action.fieldErrors[path];
  /** Any error under a profile's steps, shown under its table. */
  const stepError = (i: number) =>
    Object.entries(action.fieldErrors).find(([key]) => key.startsWith(`profiles.${i}.steps`))?.[1];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = profiles.map((p) =>
      p.same
        ? { id: p.id, name: p.name, rate: p.rates[0] ?? "0", steps: [] }
        : { id: p.id, name: p.name, ...stepsFromRates(years, p.rates) },
    );
    action.run(
      () => setTaxProfilesAction({ financialId: f.id, rowVer: f.rowVer, profiles: input }),
      { onSuccess: () => onSaved?.() },
    );
  };

  const body = (
    <>
      <ErrorSummary message={action.summary} />
      {action.conflict ? (
        <Button variant="secondary" onClick={action.reload}>
          {M.reload}
        </Button>
      ) : null}
      <fieldset disabled={!canEdit || action.pending} className="flex flex-col gap-3">
        <ul className="flex flex-col gap-3">
          {profiles.map((p, i) => (
            <li
              key={p.id ?? `new-${i}`}
              className="flex flex-col gap-3 rounded-md border border-line bg-surface p-3"
              data-testid="tax-profile"
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
                <Field
                  label={M.profileName}
                  name={`profiles.${i}.name`}
                  errors={err(`profiles.${i}.name`)}
                >
                  <Input
                    value={p.name}
                    maxLength={100}
                    onChange={(e) => change(i, { name: e.target.value })}
                  />
                </Field>
                {p.same ? (
                  <Field
                    label={M.rate}
                    name={`profiles.${i}.rate`}
                    errors={err(`profiles.${i}.rate`)}
                  >
                    <Input
                      inputMode="decimal"
                      value={p.rates[0] ?? ""}
                      onChange={(e) => change(i, { rates: years.map(() => e.target.value) })}
                    />
                  </Field>
                ) : (
                  <span className="hidden sm:block" />
                )}
                <Button
                  variant="ghost"
                  disabled={p.id !== null && used.has(p.id)}
                  aria-label={M.removeProfile(p.name)}
                  onClick={() => setProfiles((list) => list.filter((_, j) => j !== i))}
                >
                  {messages.actions.delete}
                </Button>
              </div>
              {years.length > 1 ? (
                <Switch
                  label={M.sameRateEveryYear}
                  checked={p.same}
                  onChange={(e) =>
                    change(i, {
                      same: e.target.checked,
                      rates: e.target.checked ? years.map(() => p.rates[0] ?? "0") : p.rates,
                    })
                  }
                />
              ) : null}
              {!p.same ? (
                <div className="overflow-x-auto">
                  <table
                    className="w-full max-w-md border-collapse text-sm"
                    data-testid="tax-rates"
                  >
                    <thead>
                      <tr className="bg-surface-raised text-ink-muted">
                        <th
                          scope="col"
                          className="border border-line px-2 py-2 text-left font-medium"
                        >
                          {M.fiscalYear}
                        </th>
                        <th
                          scope="col"
                          className="border border-line px-2 py-2 text-left font-medium"
                        >
                          {M.rate}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {years.map((year, k) => {
                        const label = fiscalYearLabel(year, f.startMonth);
                        return (
                          <tr key={year}>
                            <th
                              scope="row"
                              className="border border-line px-2 py-1 text-left font-normal text-ink"
                            >
                              {label}
                            </th>
                            <td className="border border-line p-0">
                              <input
                                inputMode="decimal"
                                aria-label={M.rateFor(label)}
                                value={p.rates[k] ?? ""}
                                onChange={(e) => changeRate(i, k, e.target.value)}
                                className="min-h-10 w-full bg-transparent px-2 text-sm text-ink tabular-nums"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(err(`profiles.${i}.rate`) ?? stepError(i)) ? (
                    <p className="mt-1 text-sm text-danger">
                      {(err(`profiles.${i}.rate`) ?? stepError(i))![0]}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {err("profiles") ? <p className="text-sm text-danger">{err("profiles")![0]}</p> : null}
        {canEdit ? (
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={profiles.length >= 20}
              onClick={() =>
                setProfiles((list) => [
                  ...list,
                  { id: null, name: "", same: true, rates: years.map(() => "0") },
                ])
              }
            >
              {M.addProfile}
            </Button>
            <Button type="submit" pending={action.pending} data-testid="save-tax-profiles">
              {messages.actions.save}
            </Button>
          </div>
        ) : null}
      </fieldset>
    </>
  );

  return (
    <form
      noValidate
      onSubmit={submit}
      data-testid="tax-profiles-form"
      className="flex flex-col gap-4"
    >
      {framed ? (
        <Panel id="fin-tax" title={M.taxProfiles}>
          {body}
        </Panel>
      ) : (
        body
      )}
    </form>
  );
}

function DeleteFinancial({ sheet }: { sheet: SheetDto }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const action = useFinancialAction();
  const f = sheet.financial;
  return (
    <div>
      <ErrorSummary message={action.summary} />
      <Button variant="danger" onClick={() => setOpen(true)} data-testid="delete-financial">
        {messages.actions.delete}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={messages.confirmDelete.title(M.entity, f.title)}
        body={messages.confirmDelete.body}
        confirmLabel={messages.actions.delete}
        pending={action.pending}
        onConfirm={() =>
          action.run(() => deleteFinancialAction({ financialId: f.id, rowVer: f.rowVer }), {
            success: messages.feedback.deleted,
            onSuccess: () => {
              setOpen(false);
              router.replace(`/projects/${f.projectId}/financials/budget`);
            },
          })
        }
      />
    </div>
  );
}
