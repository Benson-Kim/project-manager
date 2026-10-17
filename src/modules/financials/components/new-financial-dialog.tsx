"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Select } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { createFinancialAction } from "../actions";
import { useFinancialAction } from "./use-financial-action";

const M = messages.financials;

export interface TemplateChoice {
  id: number;
  name: string;
}

/** New project financials (ADR-0029): from a master template (copied now) or blank. */
export function NewFinancialDialog({
  projectId,
  templates,
  defaultFirstYear,
}: {
  projectId: number;
  templates: TemplateChoice[];
  defaultFirstYear: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState(templates[0] ? String(templates[0].id) : "");
  const [firstYear, setFirstYear] = useState(String(defaultFirstYear));
  const action = useFinancialAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    action.run(
      () => createFinancialAction({ projectId, title, templateId, firstFiscalYear: firstYear }),
      {
        success: messages.feedback.created,
        onSuccess: (data) => {
          setOpen(false);
          router.push(`/projects/${projectId}/financials/budget?f=${data.financialId}`);
        },
      },
    );
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} data-testid="new-financial">
        {M.newFinancial}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={M.newFinancial}
        description={M.templateNote}
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <ErrorSummary message={action.summary} />
          <Field label={M.titleLabel} name="title" errors={action.fieldErrors.title}>
            <Input
              value={title}
              maxLength={150}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label={M.fromTemplate} name="templateId" errors={action.fieldErrors.templateId}>
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="">{M.blank}</option>
            </Select>
          </Field>
          <Field
            label={M.firstFiscalYear}
            name="firstFiscalYear"
            errors={action.fieldErrors.firstFiscalYear}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={2000}
              max={2100}
              value={firstYear}
              onChange={(e) => setFirstYear(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {messages.actions.cancel}
            </Button>
            <Button type="submit" pending={action.pending} data-testid="create-financial">
              {messages.actions.create}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
