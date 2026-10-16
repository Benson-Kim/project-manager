"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Select, Switch, Textarea } from "@/components/ui/form/inputs";
import { SectionHeading } from "@/components/ui/form/section-heading";
import { useUnsavedChangesGuard } from "@/components/ui/form/use-unsaved-changes-guard";
import { messages } from "@/lib/messages";
import { deleteTemplateAction, saveTemplateAction } from "../actions";
import { formatPercent, parseFraction } from "../calc/money";
import { labelsFromText, SECTION_VALUES } from "../schemas/fields";
import {
  saveTemplateInput,
  type Template,
  type TemplateDefinitionInput,
} from "../schemas/template";
import { fromChoice, RequiredSelect, toChoice, type RequiredChoice } from "./document-dialog";
import { MONTHS } from "./months";
import {
  fromDrafts,
  SuggestionsEditor,
  toDrafts,
  type SuggestionDraft,
} from "./suggestions-editor";
import { useFinancialAction } from "./use-financial-action";

/**
 * The master template editor (ADR-0029): settings, tax profiles, cost
 * categories, funding sources, standard lines and the document checklist new
 * financials copy (ADR-0030). Admins edit; everyone else
 * reads (the whole form is a disabled fieldset). Rates are typed as
 * percentages; the action stores fractions. Validated with the action's own
 * schema before sending; the proc checks again.
 */

const M = messages.financials;
const T = M.templates;
const DOC = M.documents;

interface LineState {
  uid: number;
  section: (typeof SECTION_VALUES)[number];
  description: string;
  costCategory: string;
  fundingSource: string;
  taxProfileKey: string;
  isRecurrent: boolean;
  amount: string;
}

interface DocumentState {
  uid: number;
  name: string;
  required: RequiredChoice;
  reason: string;
  suggestions: SuggestionDraft[];
}

interface ProfileState {
  key: string;
  name: string;
  rate: string;
  isDefault: boolean;
}

const percentOf = (fraction: string) => formatPercent(parseFraction(fraction) ?? 0n);

let nextUid = 1;

function initialState(template: Template | null) {
  const d = template?.definition;
  return {
    name: template?.name ?? "",
    isDefault: template?.isDefault ?? false,
    horizonYears: String(d?.horizonYears ?? 5),
    startMonth: String(d?.fiscalYearStartMonth ?? 4),
    escalationRate: d ? percentOf(d.escalationRate) : "0",
    flagThresholdRate: d ? percentOf(d.flagThresholdRate) : "10",
    profiles: (d?.taxProfiles ?? []).map((p) => ({
      ...p,
      rate: percentOf(p.rate),
    })) as ProfileState[],
    categories: (d?.costCategories ?? []).join("\n"),
    sources: (d?.fundingSources ?? []).join("\n"),
    lines: (d?.lines ?? []).map<LineState>((l) => ({
      uid: nextUid++,
      section: l.section,
      description: l.description,
      costCategory: l.costCategory ?? "",
      fundingSource: l.fundingSource ?? "",
      taxProfileKey: l.taxProfileKey ?? "",
      isRecurrent: l.isRecurrent,
      amount: l.amount ?? "",
    })),
    documents: (d?.documents ?? []).map<DocumentState>((doc) => ({
      uid: nextUid++,
      name: doc.name,
      required: toChoice(doc.required),
      reason: doc.reason ?? "",
      suggestions: toDrafts(doc.suggestions),
    })),
  };
}

function nextProfileKey(profiles: ProfileState[]): string {
  let n = profiles.length + 1;
  while (profiles.some((p) => p.key === `t${n}`)) n++;
  return `t${n}`;
}

export function TemplateEditor({
  template,
  canEdit,
}: {
  template: Template | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const initial = useMemo(() => initialState(template), [template]);
  const [state, setState] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const action = useFinancialAction();
  useUnsavedChangesGuard(dirty);

  const change = (patch: Partial<typeof state>) => {
    setState((s) => ({ ...s, ...patch }));
    setDirty(true);
  };
  const changeLine = (uid: number, patch: Partial<LineState>) =>
    change({ lines: state.lines.map((l) => (l.uid === uid ? { ...l, ...patch } : l)) });
  const changeProfile = (index: number, patch: Partial<ProfileState>) =>
    change({
      profiles: state.profiles.map((p, i) =>
        i === index ? { ...p, ...patch } : patch.isDefault ? { ...p, isDefault: false } : p,
      ),
    });
  const changeDocument = (uid: number, patch: Partial<DocumentState>) =>
    change({ documents: state.documents.map((d) => (d.uid === uid ? { ...d, ...patch } : d)) });
  const moveDocument = (index: number, delta: -1 | 1) => {
    const documents = [...state.documents];
    const target = index + delta;
    if (target < 0 || target >= documents.length) return;
    [documents[index], documents[target]] = [documents[target]!, documents[index]!];
    change({ documents });
  };
  const moveLine = (index: number, delta: -1 | 1) => {
    const lines = [...state.lines];
    const target = index + delta;
    if (target < 0 || target >= lines.length) return;
    [lines[index], lines[target]] = [lines[target]!, lines[index]!];
    change({ lines });
  };

  const definition: TemplateDefinitionInput = {
    horizonYears: state.horizonYears,
    fiscalYearStartMonth: state.startMonth,
    escalationRate: state.escalationRate,
    flagThresholdRate: state.flagThresholdRate,
    taxProfiles: state.profiles,
    costCategories: labelsFromText(state.categories),
    fundingSources: labelsFromText(state.sources),
    lines: state.lines.map((l) => ({
      section: l.section,
      description: l.description,
      costCategory: l.costCategory,
      fundingSource: l.fundingSource,
      taxProfileKey: l.taxProfileKey,
      isRecurrent: l.isRecurrent,
      amount: l.amount,
    })),
    documents: state.documents.map((d) => ({
      name: d.name,
      required: fromChoice(d.required),
      reason: d.reason,
      suggestions: fromDrafts(d.suggestions),
    })),
  };

  const save = () => {
    const input = {
      templateId: template?.id ?? null,
      name: state.name,
      isDefault: state.isDefault,
      definition,
      rowVer: template?.rowVer ?? null,
    };
    const parsed = saveTemplateInput.safeParse(input);
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues)
        (errors[issue.path.join(".")] ??= []).push(issue.message);
      action.setFieldErrors(errors);
      action.setSummary(messages.errors.VALIDATION);
      return;
    }
    action.run(() => saveTemplateAction(input), {
      success: T.saved,
      onSuccess: (data) => {
        setDirty(false);
        if (!template) router.replace(`/settings/financial-templates/${data.templateId}`);
      },
    });
  };

  const remove = () => {
    if (!template) return;
    action.run(() => deleteTemplateAction({ templateId: template.id, rowVer: template.rowVer }), {
      success: messages.feedback.deleted,
      onSuccess: () => {
        setDirty(false);
        setConfirmDelete(false);
        router.replace("/settings/financial-templates");
      },
    });
  };

  const err = (path: string) => action.fieldErrors[path];
  /** The errors under one path, keyed relative to it ("suggestions.0.amount"). */
  const errorsUnder = (prefix: string) =>
    Object.fromEntries(
      Object.entries(action.fieldErrors)
        .filter(([key]) => key.startsWith(`${prefix}.`))
        .map(([key, value]) => [key.slice(prefix.length + 1), value]),
    );
  const categories = labelsFromText(state.categories);
  const sources = labelsFromText(state.sources);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-6 pb-8"
      data-testid="template-editor"
    >
      {!canEdit ? <p className="text-sm text-ink-muted">{T.adminOnly}</p> : null}
      <ErrorSummary message={action.summary} />
      {action.conflict ? (
        <Button variant="secondary" onClick={action.reload}>
          {M.reload}
        </Button>
      ) : null}

      <fieldset disabled={!canEdit || action.pending} className="flex flex-col gap-6">
        <section className="grid gap-4 sm:grid-cols-2" aria-labelledby="tpl-settings">
          <SectionHeading id="tpl-settings">{M.settings}</SectionHeading>
          <div className="sm:col-span-2">
            <Field label={T.name} name="name" errors={err("name")}>
              <Input
                value={state.name}
                maxLength={100}
                onChange={(e) => change({ name: e.target.value })}
              />
            </Field>
          </div>
          <Switch
            label={T.isDefault}
            checked={state.isDefault}
            onChange={(e) => change({ isDefault: e.target.checked })}
            className="sm:col-span-2"
          />
          <Field
            label={M.horizonYears}
            name="definition.horizonYears"
            errors={err("definition.horizonYears")}
          >
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
          <Field
            label={M.startMonth}
            name="definition.fiscalYearStartMonth"
            errors={err("definition.fiscalYearStartMonth")}
          >
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
          <Field
            label={M.escalationRate}
            name="definition.escalationRate"
            errors={err("definition.escalationRate")}
          >
            <Input
              inputMode="decimal"
              value={state.escalationRate}
              onChange={(e) => change({ escalationRate: e.target.value })}
            />
          </Field>
          <Field
            label={M.flagThreshold}
            name="definition.flagThresholdRate"
            errors={err("definition.flagThresholdRate")}
          >
            <Input
              inputMode="decimal"
              value={state.flagThresholdRate}
              onChange={(e) => change({ flagThresholdRate: e.target.value })}
            />
          </Field>
        </section>

        <section aria-labelledby="tpl-tax" className="flex flex-col gap-3">
          <SectionHeading id="tpl-tax">{M.taxProfiles}</SectionHeading>
          {err("definition.taxProfiles") ? (
            <p className="text-sm text-danger">{err("definition.taxProfiles")![0]}</p>
          ) : null}
          <ul className="flex flex-col gap-3">
            {state.profiles.map((profile, i) => (
              <li
                key={profile.key}
                className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-[1fr_8rem_auto_auto] sm:items-end"
              >
                <Field
                  label={M.profileName}
                  name={`definition.taxProfiles.${i}.name`}
                  errors={err(`definition.taxProfiles.${i}.name`)}
                >
                  <Input
                    value={profile.name}
                    maxLength={100}
                    onChange={(e) => changeProfile(i, { name: e.target.value })}
                  />
                </Field>
                <Field
                  label={M.rate}
                  name={`definition.taxProfiles.${i}.rate`}
                  errors={err(`definition.taxProfiles.${i}.rate`)}
                >
                  <Input
                    inputMode="decimal"
                    value={profile.rate}
                    onChange={(e) => changeProfile(i, { rate: e.target.value })}
                  />
                </Field>
                <Switch
                  label={T.defaultBadge}
                  checked={profile.isDefault}
                  onChange={(e) => changeProfile(i, { isDefault: e.target.checked })}
                />
                <Button
                  variant="ghost"
                  aria-label={M.removeProfile(profile.name || profile.key)}
                  onClick={() =>
                    change({
                      profiles: state.profiles.filter((_, j) => j !== i),
                      lines: state.lines.map((l) =>
                        l.taxProfileKey === profile.key ? { ...l, taxProfileKey: "" } : l,
                      ),
                    })
                  }
                >
                  {messages.actions.delete}
                </Button>
              </li>
            ))}
          </ul>
          <div>
            <Button
              variant="secondary"
              disabled={state.profiles.length >= 20}
              onClick={() =>
                change({
                  profiles: [
                    ...state.profiles,
                    { key: nextProfileKey(state.profiles), name: "", rate: "0", isDefault: false },
                  ],
                })
              }
            >
              {M.addProfile}
            </Button>
          </div>
        </section>

        <section aria-labelledby="tpl-lists" className="grid gap-4 sm:grid-cols-2">
          <SectionHeading id="tpl-lists">
            {M.costCategories} · {M.fundingSources}
          </SectionHeading>
          <Field
            label={M.costCategories}
            name="definition.costCategories"
            errors={err("definition.costCategories")}
          >
            <Textarea
              rows={8}
              spellCheck={false}
              value={state.categories}
              onChange={(e) => change({ categories: e.target.value })}
            />
          </Field>
          <Field
            label={M.fundingSources}
            name="definition.fundingSources"
            errors={err("definition.fundingSources")}
          >
            <Textarea
              rows={8}
              spellCheck={false}
              value={state.sources}
              onChange={(e) => change({ sources: e.target.value })}
            />
          </Field>
          <p className="text-sm text-ink-muted sm:col-span-2">{M.oneLabelPerLine}</p>
        </section>

        <section aria-labelledby="tpl-lines" className="flex flex-col gap-3">
          <SectionHeading id="tpl-lines">{T.standardLines}</SectionHeading>
          <datalist id="tpl-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <datalist id="tpl-sources">
            {sources.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <ol className="flex flex-col gap-3">
            {state.lines.map((line, i) => {
              const path = `definition.lines.${i}`;
              const name = line.description || `${M.line} ${i + 1}`;
              return (
                <li
                  key={line.uid}
                  className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-2 lg:grid-cols-4"
                  data-testid="template-line"
                >
                  <Field label={M.section} name={`${path}.section`}>
                    <Select
                      value={line.section}
                      onChange={(e) =>
                        changeLine(line.uid, { section: e.target.value as LineState["section"] })
                      }
                    >
                      {SECTION_VALUES.map((s) => (
                        <option key={s} value={s}>
                          {M.sections[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="sm:col-span-1 lg:col-span-3">
                    <Field
                      label={M.description}
                      name={`${path}.description`}
                      errors={err(`${path}.description`)}
                    >
                      <Input
                        value={line.description}
                        maxLength={255}
                        onChange={(e) => changeLine(line.uid, { description: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Field
                    label={M.costCategory}
                    name={`${path}.costCategory`}
                    errors={err(`${path}.costCategory`)}
                  >
                    <Input
                      list="tpl-categories"
                      value={line.costCategory}
                      maxLength={150}
                      onChange={(e) => changeLine(line.uid, { costCategory: e.target.value })}
                    />
                  </Field>
                  <Field
                    label={M.fundingSource}
                    name={`${path}.fundingSource`}
                    errors={err(`${path}.fundingSource`)}
                  >
                    <Input
                      list="tpl-sources"
                      value={line.fundingSource}
                      maxLength={150}
                      onChange={(e) => changeLine(line.uid, { fundingSource: e.target.value })}
                    />
                  </Field>
                  <Field
                    label={M.taxProfile}
                    name={`${path}.taxProfileKey`}
                    errors={err(`${path}.taxProfileKey`)}
                  >
                    <Select
                      value={line.taxProfileKey}
                      onChange={(e) => changeLine(line.uid, { taxProfileKey: e.target.value })}
                    >
                      <option value="">{M.noTax}</option>
                      {state.profiles.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.name || p.key}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={T.amount} name={`${path}.amount`} errors={err(`${path}.amount`)}>
                    <Input
                      inputMode="decimal"
                      value={line.amount}
                      onChange={(e) => changeLine(line.uid, { amount: e.target.value })}
                    />
                  </Field>
                  <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
                    <Switch
                      label={M.recurrent}
                      checked={line.isRecurrent}
                      onChange={(e) => changeLine(line.uid, { isRecurrent: e.target.checked })}
                    />
                    <span className="flex-1" />
                    <Button
                      variant="ghost"
                      aria-label={M.moveUp(name)}
                      disabled={i === 0}
                      onClick={() => moveLine(i, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={M.moveDown(name)}
                      disabled={i === state.lines.length - 1}
                      onClick={() => moveLine(i, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={M.deleteLine(name)}
                      onClick={() =>
                        change({ lines: state.lines.filter((l) => l.uid !== line.uid) })
                      }
                    >
                      {messages.actions.delete}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
          <div>
            <Button
              variant="secondary"
              disabled={state.lines.length >= 300}
              onClick={() =>
                change({
                  lines: [
                    ...state.lines,
                    {
                      uid: nextUid++,
                      section: "operating",
                      description: "",
                      costCategory: "",
                      fundingSource: "",
                      taxProfileKey: state.profiles.find((p) => p.isDefault)?.key ?? "",
                      isRecurrent: false,
                      amount: "",
                    },
                  ],
                })
              }
            >
              {M.addLine(M.sections.operating)}
            </Button>
          </div>
        </section>

        <section aria-labelledby="tpl-documents" className="flex flex-col gap-3">
          <SectionHeading id="tpl-documents">{DOC.heading}</SectionHeading>
          {err("definition.documents") ? (
            <p className="text-sm text-danger" role="alert">
              {err("definition.documents")!.join(" ")}
            </p>
          ) : null}
          {state.documents.length === 0 ? (
            <p className="text-sm text-ink-muted">{DOC.empty}</p>
          ) : null}
          <ol className="flex flex-col gap-3">
            {state.documents.map((doc, i) => {
              const path = `definition.documents.${i}`;
              const label = doc.name || `${DOC.name} ${i + 1}`;
              return (
                <li
                  key={doc.uid}
                  className="flex flex-col gap-3 rounded-md border border-line p-3"
                  data-testid={`template-document-${i}`}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={DOC.name} name={`${path}.name`} errors={err(`${path}.name`)}>
                      <Input
                        value={doc.name}
                        maxLength={200}
                        onChange={(e) => changeDocument(doc.uid, { name: e.target.value })}
                      />
                    </Field>
                    <Field label={DOC.required} name={`${path}.required`}>
                      <RequiredSelect
                        value={doc.required}
                        onChange={(required) => changeDocument(doc.uid, { required })}
                      />
                    </Field>
                  </div>
                  <Field label={DOC.reason} name={`${path}.reason`} errors={err(`${path}.reason`)}>
                    <Textarea
                      rows={2}
                      maxLength={2000}
                      value={doc.reason}
                      onChange={(e) => changeDocument(doc.uid, { reason: e.target.value })}
                    />
                  </Field>
                  <SuggestionsEditor
                    value={doc.suggestions}
                    onChange={(suggestions) => changeDocument(doc.uid, { suggestions })}
                    errors={errorsUnder(path)}
                    idPrefix={`tpl-doc-${doc.uid}`}
                  />
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button
                      variant="ghost"
                      aria-label={DOC.moveUp(label)}
                      disabled={i === 0}
                      onClick={() => moveDocument(i, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={DOC.moveDown(label)}
                      disabled={i === state.documents.length - 1}
                      onClick={() => moveDocument(i, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={DOC.remove(label)}
                      onClick={() =>
                        change({ documents: state.documents.filter((d) => d.uid !== doc.uid) })
                      }
                    >
                      {DOC.removeLabel}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
          <div>
            <Button
              variant="secondary"
              disabled={state.documents.length >= 50}
              data-testid="template-add-document"
              onClick={() =>
                change({
                  documents: [
                    ...state.documents,
                    { uid: nextUid++, name: "", required: "", reason: "", suggestions: [] },
                  ],
                })
              }
            >
              {DOC.add}
            </Button>
          </div>
        </section>
      </fieldset>

      {canEdit ? (
        <div className="flex flex-wrap gap-3">
          <Button type="submit" pending={action.pending} data-testid="save-template">
            {messages.actions.save}
          </Button>
          {template ? (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              {messages.actions.delete}
            </Button>
          ) : null}
        </div>
      ) : null}

      {template ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={T.deleteTemplate(template.name)}
          body={T.deleteBody}
          confirmLabel={messages.actions.delete}
          onConfirm={remove}
          pending={action.pending}
        />
      ) : null}
    </form>
  );
}
