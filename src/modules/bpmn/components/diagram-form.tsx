"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DialogActions } from "@/components/ui/dialog";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { firstError } from "@/modules/key-deliverables/components/wbs-queue";
import { createDiagramAction, renameDiagramAction } from "../actions";
import { DIAGRAM_NAME_MAX } from "../model/diagram";
import type { WithRowVer } from "./use-diagram-save";

const M = messages.bpmn;

/** Names a new diagram, or with `rename`, renames the open one between the editor's saves. */
export function DiagramForm({
  projectId,
  rename,
  onDone,
}: {
  projectId: number;
  rename?: {
    diagramId: number;
    name: string;
    withRowVer: WithRowVer;
  };
  /** Closes the dialog the form sits in; given, the form also shows Cancel. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(rename?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      if (rename) {
        const result = await rename.withRowVer((rowVer) =>
          renameDiagramAction({ diagramId: rename.diagramId, name, rowVer }),
        );
        if (!result.ok) return setError(firstError(result.error));
        onDone?.();
        return;
      }
      const result = await createDiagramAction({ projectId, name });
      if (!result.ok) return setError(firstError(result.error));
      onDone?.();
      router.push(`?diagram=${result.data.BpmnDiagramId}`);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 text-left">
      <Field label={M.nameLabel} name="name" errors={error ? [error] : undefined}>
        <Input
          name="name"
          data-testid="bpmn-diagram-name"
          value={name}
          maxLength={DIAGRAM_NAME_MAX}
          required
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
      </Field>
      <DialogActions onCancel={onDone}>
        <Button type="submit" pending={pending} data-testid="bpmn-diagram-save">
          {rename ? messages.actions.save : M.create}
        </Button>
      </DialogActions>
    </form>
  );
}
