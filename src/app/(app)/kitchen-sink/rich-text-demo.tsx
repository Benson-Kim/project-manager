"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { RichTextEditor } from "@/components/ui/rich-text/rich-text-editor";
import { messages } from "@/lib/messages";
import { richTextDemoSchema } from "./rich-text-demo-schema";

/**
 * Rich-text demo (ADR-0025): the editor inside a plain form, validated on
 * blur and submit; submitting is a GET to this page, which sanitises on the
 * server and renders the result with RichTextView (`preview`). `legacy` shows
 * a seeded Access value converted on render. data-dirty proves the editor's
 * edits reach a fieldset onChange, as sheets use for their unsaved guard.
 */
export function RichTextDemo({
  defaultValue,
  preview,
  legacy,
}: {
  defaultValue: string;
  preview: React.ReactNode;
  legacy: React.ReactNode;
}) {
  const form = useZodForm(richTextDemoSchema);
  const [summary, setSummary] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  return (
    <section aria-labelledby="ks-rich-text">
      <h2 id="ks-rich-text" className="mb-3 text-base font-semibold text-ink">
        Rich text
      </h2>
      <form
        method="get"
        action="/kitchen-sink"
        noValidate
        onBlur={form.onBlur}
        data-testid="ks-rich-text-form"
        data-dirty={dirty}
        className="flex max-w-2xl flex-col gap-4"
        onSubmit={(e) => {
          const valid = form.validate(e.currentTarget);
          setSummary(valid ? null : messages.errors.VALIDATION);
          if (!valid) e.preventDefault();
        }}
      >
        <ErrorSummary message={summary} />
        <fieldset onChange={() => setDirty(true)} className="flex flex-col gap-4">
          <Field label="Description" name="richText" errors={form.errors.richText}>
            <RichTextEditor name="richText" defaultValue={defaultValue} testId="ks-rich-text" />
          </Field>
        </fieldset>
        <div>
          <Button type="submit">Preview</Button>
        </div>
      </form>
      {/* Read-only sheets disable their fieldset; the editor follows it. */}
      <fieldset disabled className="mt-6 max-w-2xl">
        <Field label="Archived copy" name="archivedCopy">
          <RichTextEditor
            name="archivedCopy"
            defaultValue={defaultValue}
            testId="ks-rich-text-readonly"
          />
        </Field>
      </fieldset>
      <h3 className="mt-6 mb-2 text-sm font-semibold text-ink">Saved and rendered</h3>
      <div className="max-w-2xl rounded-md border border-line p-3">{preview}</div>
      <h3 className="mt-6 mb-2 text-sm font-semibold text-ink">Access value, converted</h3>
      <div className="max-w-2xl rounded-md border border-line p-3">{legacy}</div>
    </section>
  );
}
