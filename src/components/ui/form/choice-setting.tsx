"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Select } from "@/components/ui/form/inputs";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action";
import { messages } from "@/lib/messages";

interface ChoiceSettingProps {
  testId: string;
  label: string;
  name: string;
  value: number;
  options: readonly number[];
  optionLabel: (option: number) => string;
  save: (value: number) => Promise<ActionResult<unknown>>;
}

/** One of the user's own settings: a fixed list of numbers, saved on its own. */
export function ChoiceSetting({
  testId,
  label,
  name,
  value,
  options,
  optionLabel,
  save,
}: ChoiceSettingProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [choice, setChoice] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      data-testid={testId}
      className="flex max-w-sm flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        start(async () => {
          try {
            const result = await save(choice);
            if (!result.ok) {
              setError(result.error.message);
              return;
            }
            toast({ variant: "success", title: messages.feedback.saved });
            router.refresh();
          } catch {
            setError(messages.errors.INTERNAL);
          }
        });
      }}
    >
      <ErrorSummary message={error} />
      <Field label={label} name={name}>
        <Select
          value={choice}
          disabled={pending}
          onChange={(event) => setChoice(Number(event.target.value))}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {optionLabel(option)}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        <Button type="submit" pending={pending} disabled={choice === value}>
          {messages.actions.save}
        </Button>
      </div>
    </form>
  );
}
