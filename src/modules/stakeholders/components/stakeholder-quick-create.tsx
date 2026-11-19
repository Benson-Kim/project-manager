"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { failureMessage, type FormValues } from "@/components/ui/data-view/datasheet";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { useToast } from "@/components/ui/toast";
import { notifySaved } from "@/lib/cross-window";
import { messages } from "@/lib/messages";
import { createStakeholderAction } from "../actions";
import { stakeholderOption, typedNameValues } from "../names";
import type { StakeholderOption } from "../repository/stakeholder-options";

const FIELDS = ["firstName", "lastName", "roleDescription", "emailAddress"] as const;
type QuickField = (typeof FIELDS)[number];

const LABELS: Record<QuickField, string> = {
  firstName: messages.stakeholders.firstName,
  lastName: messages.stakeholders.lastName,
  roleDescription: messages.stakeholders.roleDescription,
  emailAddress: messages.stakeholders.emailAddress,
};

/**
 * The picker's "Add new" item: closed until chosen, then holds the text that was typed so the
 * form below the box starts from it.
 */
export function useStakeholderQuickCreate(canAdd: boolean) {
  const [draft, setDraft] = useState<string | null>(null);
  const addNew = useMemo(
    () =>
      canAdd
        ? { label: messages.stakeholders.picker.addNew, onChoose: (text: string) => setDraft(text) }
        : undefined,
    [canAdd],
  );
  const close = useCallback(() => setDraft(null), []);
  return { draft, addNew, close };
}

/**
 * A new stakeholder made where they are being picked, without leaving the page: the same create
 * action and checks as the stakeholder register. Not a nested form, so its fields never submit
 * with the form around it.
 */
export function StakeholderQuickCreate({
  projectId,
  typed,
  onCreated,
  onCancel,
}: {
  projectId: number;
  typed: string;
  onCreated: (option: StakeholderOption) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<FormValues>(() => typedNameValues(projectId, typed));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const result = await createStakeholderAction({ ...values, projectId: String(projectId) });
      if (!result.ok) {
        const fieldErrors = result.error.fieldErrors ?? {};
        setErrors(fieldErrors);
        if (!FIELDS.some((f) => fieldErrors[f]?.length)) {
          toast({ variant: "error", title: failureMessage(result.error) });
        }
        return;
      }
      const option = stakeholderOption(result.data);
      toast({ variant: "success", title: messages.stakeholders.stakeholderAdded(option.name) });
      router.refresh();
      notifySaved();
      onCreated(option);
    });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (!pending) save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div
      role="group"
      aria-label={messages.stakeholders.picker.newStakeholder}
      data-testid="stakeholder-quick-create"
      className="flex flex-col gap-3 rounded-md border border-line bg-surface p-3"
      onKeyDown={onKeyDown}
    >
      <p className="m-0 text-sm font-medium text-ink">
        {messages.stakeholders.picker.newStakeholder}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((field, index) => (
          <Field key={field} label={LABELS[field]} name={field} errors={errors[field]}>
            <Input
              type={field === "emailAddress" ? "email" : "text"}
              value={values[field] ?? ""}
              autoFocus={index === 0}
              disabled={pending}
              onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          {messages.actions.cancel}
        </Button>
        <Button type="button" pending={pending} onClick={save}>
          {messages.actions.save}
        </Button>
      </div>
    </div>
  );
}
