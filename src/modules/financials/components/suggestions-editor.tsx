"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form/field";
import { Input, Select, Textarea } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { SUGGESTION_KINDS, type Suggestion, type SuggestionKind } from "../schemas/documents";

const M = messages.financials.documents;

/** A suggestion rule as typed: the amount as people write it. */
export interface SuggestionDraft {
  kind: SuggestionKind;
  amount: string;
  reason: string;
}

export function toDrafts(suggestions: readonly Suggestion[]): SuggestionDraft[] {
  return suggestions.map((s) => ({
    kind: s.kind,
    amount: s.kind === "budgetBelow" ? s.amount : "",
    reason: s.reason,
  }));
}

/** The drafts as the actions take them; a noCapital rule carries no amount. */
export function fromDrafts(drafts: readonly SuggestionDraft[]) {
  return drafts.map((d) =>
    d.kind === "budgetBelow"
      ? { kind: d.kind, amount: d.amount, reason: d.reason }
      : { kind: d.kind, reason: d.reason },
  );
}

/**
 * The advisory rules of one document (ADR-0030): at most one of each kind, each
 * with the reason it offers. Shared by the financial's document dialog and the
 * template editor. Errors are keyed like the action's ("suggestions.0.amount").
 */
export function SuggestionsEditor({
  value,
  onChange,
  errors,
  idPrefix,
  disabled = false,
}: {
  value: SuggestionDraft[];
  onChange: (next: SuggestionDraft[]) => void;
  errors: Record<string, string[] | undefined>;
  idPrefix: string;
  disabled?: boolean;
}) {
  const unused = SUGGESTION_KINDS.filter((k) => !value.some((s) => s.kind === k));
  const set = (i: number, patch: Partial<SuggestionDraft>) =>
    onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="text-sm font-medium text-ink">{M.suggestions}</legend>
      <p className="text-xs text-ink-muted">{M.suggestionsNote}</p>
      {errors.suggestions ? (
        <p className="text-sm text-danger" role="alert">
          {errors.suggestions.join(" ")}
        </p>
      ) : null}
      {value.map((s, i) => (
        <div
          key={s.kind}
          className="flex flex-col gap-3 rounded-md border border-line p-3"
          data-testid={`suggestion-${s.kind}`}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={M.kind} name={`${idPrefix}-kind-${i}`}>
              <Select
                value={s.kind}
                onChange={(e) => {
                  const kind = e.target.value as SuggestionKind;
                  if (kind !== s.kind && value.some((o) => o.kind === kind)) return;
                  set(i, { kind });
                }}
              >
                {SUGGESTION_KINDS.map((k) => (
                  <option
                    key={k}
                    value={k}
                    disabled={k !== s.kind && value.some((o) => o.kind === k)}
                  >
                    {M.kinds[k]}
                  </option>
                ))}
              </Select>
            </Field>
            {s.kind === "budgetBelow" ? (
              <Field
                label={M.threshold}
                name={`${idPrefix}-amount-${i}`}
                errors={errors[`suggestions.${i}.amount`]}
              >
                <Input
                  inputMode="decimal"
                  value={s.amount}
                  onChange={(e) => set(i, { amount: e.target.value })}
                />
              </Field>
            ) : null}
          </div>
          <Field
            label={M.suggestedReason}
            name={`${idPrefix}-reason-${i}`}
            errors={errors[`suggestions.${i}.reason`]}
          >
            <Textarea
              rows={2}
              maxLength={2000}
              value={s.reason}
              onChange={(e) => set(i, { reason: e.target.value })}
            />
          </Field>
          <div className="flex justify-end">
            <Button
              variant="ghost"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              aria-label={M.removeSuggestion(M.kinds[s.kind])}
            >
              {M.removeLabel}
            </Button>
          </div>
        </div>
      ))}
      {unused.length > 0 ? (
        <div>
          <Button
            variant="secondary"
            onClick={() => onChange([...value, { kind: unused[0]!, amount: "", reason: "" }])}
            data-testid={`${idPrefix}-add-suggestion`}
          >
            {M.addSuggestion}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}
