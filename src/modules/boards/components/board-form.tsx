"use client";
import { createContext, useContext, useState, useTransition } from "react";
import { z } from "zod";
import type { ActionResult } from "@/lib/action";
import { Dialog, Sheet } from "@/components/ui/dialog";
import { Field, type FieldProps } from "@/components/ui/form/field";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { UnsavedChangesScope, useUnsavedPart } from "@/components/ui/form/unsaved-scope";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import { hasUnshownIssue } from "../schemas/board-form";
export { toDateInput as isoDate } from "@/lib/format";

const Errors = createContext<Record<string, string[]>>({});
/** Only composes the shared Field; labels, ids, errors and aria stay in one primitive. */
export function BoardField(props: Omit<FieldProps, "errors">) {
  const errors = useContext(Errors);
  return <Field {...props} errors={errors[props.name]} />;
}
/** The card sheet carries the requirement and deliverable panels beside its fields. */
function WideSheet(props: React.ComponentProps<typeof Dialog>) {
  return <Sheet {...props} wide />;
}
interface Props<T extends z.ZodType, R> {
  title: string;
  children: React.ReactNode;
  schema: T;
  save: (input: z.output<T>) => Promise<ActionResult<R>>;
  close: () => void;
  onSaved?: (result: R) => void;
  readOnly?: boolean;
  submitDisabled?: boolean;
  sheet?: boolean;
  submitLabel?: string;
}
export function BoardForm<T extends z.ZodType, R>(props: Props<T, R>) {
  return (
    <UnsavedChangesScope>
      <FormContent {...props} />
    </UnsavedChangesScope>
  );
}
function FormContent<T extends z.ZodType, R>({
  title,
  children,
  schema,
  save,
  close,
  onSaved,
  readOnly = false,
  submitDisabled = false,
  sheet = false,
  submitLabel = messages.actions.save,
}: Props<T, R>) {
  const form = useZodForm(schema);
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const unsaved = useUnsavedPart("board-form", dirty);
  const Overlay = sheet ? WideSheet : Dialog;
  const requestClose = () => {
    if (!pending) unsaved.leave(close);
  };
  return (
    <Overlay
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
      title={title}
    >
      <form
        className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto"
        noValidate
        onChange={() => setDirty(true)}
        onBlur={form.onBlur}
        onSubmit={(event) => {
          event.preventDefault();
          const target = event.currentTarget;
          if (pending || readOnly || submitDisabled) return;
          const parsed = schema.safeParse(Object.fromEntries(new FormData(target)));
          if (!parsed.success) {
            form.validate(target);
            const unshown = hasUnshownIssue(parsed.error, (name) =>
              Boolean(target.elements.namedItem(name)),
            );
            setError(unshown ? messages.errors.INTERNAL : null);
            return;
          }
          setError(null);
          start(async () => {
            try {
              const result = await save(parsed.data);
              form.applyResult(result);
              if (result.ok) {
                unsaved.markClean();
                toast({ variant: "success", title: messages.feedback.saved });
                onSaved?.(result.data);
                close();
              } else setError(result.error.message);
            } catch {
              setError(messages.errors.INTERNAL);
            }
          });
        }}
      >
        <ErrorSummary message={error} />
        <Errors.Provider value={form.errors}>
          <fieldset disabled={pending || readOnly} className="flex min-w-0 flex-col gap-4">
            {children}
          </fieldset>
        </Errors.Provider>
        {/* Pinned: a late-loading editor above cannot move Save out from under a click. */}
        <div className="sticky bottom-0 flex justify-end gap-2 bg-surface pt-2">
          <Button variant="secondary" disabled={pending} onClick={requestClose}>
            {messages.actions.cancel}
          </Button>
          {!readOnly ? (
            <Button type="submit" pending={pending} disabled={submitDisabled}>
              {submitLabel}
            </Button>
          ) : null}
        </div>
      </form>
    </Overlay>
  );
}
