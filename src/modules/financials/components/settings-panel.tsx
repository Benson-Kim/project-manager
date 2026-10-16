"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Select, Switch, Textarea } from "@/components/ui/form/inputs";
import { SectionHeading } from "@/components/ui/form/section-heading";
import { useUnsavedChangesGuard } from "@/components/ui/form/use-unsaved-changes-guard";
import { messages } from "@/lib/messages";
import { deleteFinancialAction, setTaxProfilesAction, updateFinancialAction } from "../actions";
import { fiscalYearLabel, horizonYears } from "../calc/fiscal";
import { formatPercent, parseFraction } from "../calc/money";
import { labelsFromText } from "../schemas/fields";
import type { SheetDto } from "../schemas/financial";
import { MONTHS } from "./months";
import { useFinancialAction } from "./use-financial-action";

const M = messages.financials;
const percentOf = (fraction: string) => formatPercent(parseFraction(fraction) ?? 0n);

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
    <div className="flex flex-col gap-8" data-testid="settings-panel">
      <BreakdownForm sheet={sheet} canEdit={canEdit} />
      <TaxProfilesForm sheet={sheet} canEdit={canEditTax} />
      {canDelete ? <DeleteFinancial sheet={sheet} /> : null}
    </div>
  );
}

function BreakdownForm({ sheet, canEdit }: { sheet: SheetDto; canEdit: boolean }) {
  const f = sheet.financial;
  const [state, setState] = useState({
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
    costCategories: f.costCategories.join("\n"),
    fundingSources: f.fundingSources.join("\n"),
  });
  const [dirty, setDirty] = useState(false);
  const action = useFinancialAction();
  useUnsavedChangesGuard(dirty);
  const change = (patch: Partial<typeof state>) => {
    setState((s) => ({ ...s, ...patch }));
    setDirty(true);
  };
  const err = action.fieldErrors;

  const text = (
    key: Exclude<keyof typeof state, "budgetIncludesTax">,
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
          costCategories: labelsFromText(state.costCategories),
          fundingSources: labelsFromText(state.fundingSources),
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
        <section className="grid gap-4 sm:grid-cols-2" aria-labelledby="fin-breakdown">
          <SectionHeading id="fin-breakdown">{M.breakdown}</SectionHeading>
          <div className="sm:col-span-2">{text("title", M.titleLabel, { maxLength: 150 })}</div>
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
        </section>
        <section className="grid gap-4 sm:grid-cols-2" aria-labelledby="fin-settings">
          <SectionHeading id="fin-settings">{M.settings}</SectionHeading>
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
          {text("escalationRate", M.escalationRate, { inputMode: "decimal" })}
          {text("flagThresholdRate", M.flagThreshold, { inputMode: "decimal" })}
          <Field label={M.costCategories} name="costCategories" errors={err.costCategories}>
            <Textarea
              rows={6}
              spellCheck={false}
              value={state.costCategories}
              onChange={(e) => change({ costCategories: e.target.value })}
            />
          </Field>
          <Field label={M.fundingSources} name="fundingSources" errors={err.fundingSources}>
            <Textarea
              rows={6}
              spellCheck={false}
              value={state.fundingSources}
              onChange={(e) => change({ fundingSources: e.target.value })}
            />
          </Field>
          <p className="text-sm text-ink-muted sm:col-span-2">{M.oneLabelPerLine}</p>
        </section>
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

function TaxProfilesForm({ sheet, canEdit }: { sheet: SheetDto; canEdit: boolean }) {
  const f = sheet.financial;
  const years = horizonYears(f.firstFiscalYear, f.horizonYears);
  const [profiles, setProfiles] = useState(() =>
    sheet.profiles.map((p) => ({
      id: p.id as number | null,
      name: p.name,
      rate: percentOf(p.rate),
      steps: p.steps.map((s) => ({
        fromFiscalYear: String(s.fromFiscalYear),
        rate: percentOf(s.rate),
      })),
    })),
  );
  const action = useFinancialAction();
  const used = new Set(sheet.lines.map((l) => l.taxProfileId));
  type Profile = (typeof profiles)[number];
  const change = (i: number, patch: Partial<Profile>) =>
    setProfiles((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const changeStep = (i: number, k: number, patch: Partial<Profile["steps"][number]>) =>
    change(i, { steps: profiles[i]!.steps.map((s, m) => (m === k ? { ...s, ...patch } : s)) });
  const err = (path: string) => action.fieldErrors[path];

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        action.run(() => setTaxProfilesAction({ financialId: f.id, rowVer: f.rowVer, profiles }));
      }}
      className="flex flex-col gap-3"
      aria-labelledby="fin-tax"
      data-testid="tax-profiles-form"
    >
      <SectionHeading id="fin-tax">{M.taxProfiles}</SectionHeading>
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
              className="flex flex-col gap-3 rounded-md border border-line p-3"
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
                <Field
                  label={M.rate}
                  name={`profiles.${i}.rate`}
                  errors={err(`profiles.${i}.rate`)}
                >
                  <Input
                    inputMode="decimal"
                    value={p.rate}
                    onChange={(e) => change(i, { rate: e.target.value })}
                  />
                </Field>
                <Button
                  variant="ghost"
                  disabled={p.id !== null && used.has(p.id)}
                  aria-label={M.removeProfile(p.name)}
                  onClick={() => setProfiles((list) => list.filter((_, j) => j !== i))}
                >
                  {messages.actions.delete}
                </Button>
              </div>
              {p.steps.length > 0 ? (
                <fieldset className="flex flex-col gap-2" data-testid="rate-steps">
                  <legend className="text-sm text-ink-muted">{M.rateSteps}</legend>
                  {p.steps.map((s, k) => (
                    <div key={k} className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
                      <Field
                        label={M.fromYear}
                        name={`profiles.${i}.steps.${k}.fromFiscalYear`}
                        errors={err(`profiles.${i}.steps.${k}.fromFiscalYear`)}
                      >
                        <Select
                          value={s.fromFiscalYear}
                          onChange={(e) => changeStep(i, k, { fromFiscalYear: e.target.value })}
                        >
                          {years.map((y) => (
                            <option key={y} value={y}>
                              {fiscalYearLabel(y, f.startMonth)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field
                        label={M.rate}
                        name={`profiles.${i}.steps.${k}.rate`}
                        errors={err(`profiles.${i}.steps.${k}.rate`)}
                      >
                        <Input
                          inputMode="decimal"
                          value={s.rate}
                          onChange={(e) => changeStep(i, k, { rate: e.target.value })}
                        />
                      </Field>
                      <Button
                        variant="ghost"
                        aria-label={M.removeStep(
                          fiscalYearLabel(Number(s.fromFiscalYear), f.startMonth),
                        )}
                        onClick={() => change(i, { steps: p.steps.filter((_, m) => m !== k) })}
                      >
                        {messages.actions.delete}
                      </Button>
                    </div>
                  ))}
                  {err(`profiles.${i}.steps`) ? (
                    <p className="text-sm text-danger">{err(`profiles.${i}.steps`)![0]}</p>
                  ) : null}
                </fieldset>
              ) : null}
              {canEdit ? (
                <div>
                  <Button
                    variant="ghost"
                    disabled={p.steps.length >= 10 || years.length < 2}
                    onClick={() =>
                      change(i, {
                        steps: [
                          ...p.steps,
                          {
                            fromFiscalYear: String(
                              years[Math.min(p.steps.length + 1, years.length - 1)],
                            ),
                            rate: p.rate,
                          },
                        ],
                      })
                    }
                  >
                    + {M.addStep(p.name || M.taxProfile)}
                  </Button>
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
                setProfiles((list) => [...list, { id: null, name: "", rate: "0", steps: [] }])
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
              router.replace(`/projects/${f.projectId}/financials`);
            },
          })
        }
      />
    </div>
  );
}
