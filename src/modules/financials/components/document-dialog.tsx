"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Select, Textarea } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { createDocumentAction, updateDocumentAction } from "../actions";
import { documentNameKey, type DocumentDto } from "../schemas/documents";
import {
  fromDrafts,
  SuggestionsEditor,
  toDrafts,
  type SuggestionDraft,
} from "./suggestions-editor";
import { useFinancialAction } from "./use-financial-action";

const M = messages.financials.documents;

export type RequiredChoice = "" | "yes" | "no";

export const toChoice = (required: boolean | null): RequiredChoice =>
  required === null ? "" : required ? "yes" : "no";

export const fromChoice = (choice: RequiredChoice): boolean | null =>
  choice === "" ? null : choice === "yes";

/** The tri-state select shared by the dialog and the template editor. */
export function RequiredSelect({
  value,
  onChange,
}: {
  value: RequiredChoice;
  onChange: (value: RequiredChoice) => void;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as RequiredChoice)}>
      <option value="">{M.undecided}</option>
      <option value="yes">{M.requiredYes}</option>
      <option value="no">{M.requiredNo}</option>
    </Select>
  );
}

/**
 * Add or edit one document of a financial's checklist (ADR-0030): its name,
 * whether it is required, the reason for not creating it (never required) and
 * the advisory rules that offer a reason. Files are attached on the checklist
 * itself, not here.
 */
export function DocumentDialog({
  financialId,
  document,
  otherNames,
  open,
  onOpenChange,
}: {
  financialId: number;
  document: DocumentDto | null;
  /** The financial's other document names: a duplicate is refused here, before the proc. */
  otherNames: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(document?.name ?? "");
  const [required, setRequired] = useState<RequiredChoice>(toChoice(document?.required ?? null));
  const [reason, setReason] = useState(document?.reason ?? "");
  const [suggestions, setSuggestions] = useState<SuggestionDraft[]>(
    toDrafts(document?.suggestions ?? []),
  );
  const action = useFinancialAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (otherNames.some((other) => documentNameKey(other) === documentNameKey(name))) {
      action.setFieldErrors({ name: [M.nameDuplicate] });
      action.setSummary(messages.errors.VALIDATION);
      return;
    }
    const fields = {
      name,
      required: fromChoice(required),
      reason,
      suggestions: fromDrafts(suggestions),
    };
    action.run(
      () =>
        document
          ? updateDocumentAction({ documentId: document.id, rowVer: document.rowVer, ...fields })
          : createDocumentAction({ financialId, ...fields }),
      {
        success: document ? messages.feedback.saved : messages.feedback.created,
        onSuccess: () => onOpenChange(false),
      },
    );
  };

  const err = action.fieldErrors;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={document ? M.edit(document.name) : M.add}
      wide
    >
      <form
        noValidate
        onSubmit={submit}
        className="flex max-h-[75dvh] flex-col gap-4 overflow-y-auto pr-1"
        data-testid="document-form"
      >
        <ErrorSummary message={action.summary} />
        {action.conflict ? (
          <Button variant="secondary" onClick={action.reload}>
            {messages.financials.reload}
          </Button>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={M.name} name="document-name" errors={err.name}>
            <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={M.required} name="document-required" errors={err.required}>
            <RequiredSelect value={required} onChange={setRequired} />
          </Field>
        </div>
        <Field label={M.reason} name="document-reason" errors={err.reason}>
          <Textarea
            rows={3}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <SuggestionsEditor
          value={suggestions}
          onChange={setSuggestions}
          errors={err}
          idPrefix="document"
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {messages.actions.cancel}
          </Button>
          <Button type="submit" pending={action.pending} data-testid="save-document">
            {messages.actions.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
