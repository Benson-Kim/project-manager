"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { firstError } from "@/modules/key-deliverables/components/wbs-queue";
import { createDiagramAction, renameDiagramAction } from "../actions";
import { DIAGRAM_NAME_MAX } from "../model/diagram";

const M = messages.bpmn;

/** Names a new diagram, or with `rename`, renames the open one under the version the editor holds. */
export function DiagramForm({
  projectId,
  rename,
  onDone,
}: {
  projectId: number;
  rename?: {
    diagramId: number;
    name: string;
    rowVer: () => number;
    adopt: (rowVer: number) => void;
  };
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
        const result = await renameDiagramAction({
          diagramId: rename.diagramId,
          name,
          rowVer: rename.rowVer(),
        });
        if (!result.ok) return setError(firstError(result.error));
        rename.adopt(result.data.RowVer);
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
    <form onSubmit={submit} className="flex flex-col items-stretch gap-2 text-left sm:w-80">
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
      <Button type="submit" pending={pending} data-testid="bpmn-diagram-save">
        {rename ? messages.actions.save : M.create}
      </Button>
    </form>
  );
}
