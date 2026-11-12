"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { firstError } from "@/modules/key-deliverables/components/wbs-queue";
import { createChecklistAction, renameChecklistAction } from "../actions";
import { CHECKLIST_NAME_MAX, type Checklist } from "../schemas/checklist";

const M = messages.checklists;

/** Names a new checklist and opens it, or with `rename`, renames the open one. */
export function ChecklistForm({
  projectId,
  rename,
  onDone,
}: {
  projectId: number;
  rename?: Checklist;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(rename?.Name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      if (rename) {
        const result = await renameChecklistAction({
          checklistId: rename.ChecklistId,
          name,
          rowVer: rename.RowVer,
        });
        if (!result.ok) return setError(firstError(result.error));
        onDone?.();
        router.refresh();
        return;
      }
      const result = await createChecklistAction({ projectId, name });
      if (!result.ok) return setError(firstError(result.error));
      onDone?.();
      router.push(`/projects/${projectId}/checklists?checklist=${result.data.ChecklistId}`);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col items-stretch gap-2 text-left sm:w-80">
      <Field label={M.name} name="name" errors={error ? [error] : undefined}>
        <Input
          name="name"
          data-testid="checklist-name"
          value={name}
          maxLength={CHECKLIST_NAME_MAX}
          required
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
      </Field>
      <Button type="submit" pending={pending} data-testid="checklist-save">
        {rename ? messages.actions.save : M.create}
      </Button>
    </form>
  );
}
