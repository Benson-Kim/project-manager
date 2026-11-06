"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form/field";
import { Input, Select } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { firstError } from "@/modules/key-deliverables/components/wbs-queue";
import { createCanvasAction, updateCanvasAction } from "../../actions";
import { CANVAS_NAME_MAX, type CanvasSummary } from "../../schemas/canvas";

const M = messages.requirements.canvas;

export type WbsOption = { id: number; label: string };

/** Names a new canvas and files it under a WBS item, or with `canvas`, changes both on that one. */
export function CanvasForm({
  projectId,
  deliverableOptions,
  canvas,
  defaultWbsId = null,
  onSaved,
}: {
  projectId: number;
  deliverableOptions: readonly WbsOption[];
  canvas?: CanvasSummary;
  defaultWbsId?: number | null;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(canvas?.Name ?? "");
  const [wbsId, setWbsId] = useState(canvas ? canvas.KeyDeliverableId : defaultWbsId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      if (canvas) {
        const result = await updateCanvasAction({
          canvasId: canvas.RequirementCanvasId,
          name,
          keyDeliverableId: wbsId,
          rowVer: canvas.RowVer,
        });
        if (!result.ok) return setError(firstError(result.error));
        onSaved?.();
        router.refresh();
        return;
      }
      const result = await createCanvasAction({ projectId, name, keyDeliverableId: wbsId });
      if (!result.ok) return setError(firstError(result.error));
      onSaved?.();
      router.push(`?canvas=${result.data.RequirementCanvasId}`);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col items-stretch gap-2 text-left sm:w-80">
      <Field label={M.nameLabel} name="name" errors={error ? [error] : undefined}>
        <Input
          name="name"
          data-testid="canvas-create-name"
          value={name}
          maxLength={CANVAS_NAME_MAX}
          required
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
      </Field>
      {deliverableOptions.length > 0 ? (
        <Field label={M.wbsLabel} name="keyDeliverableId">
          <Select
            name="keyDeliverableId"
            data-testid="canvas-create-wbs"
            value={wbsId ?? ""}
            onChange={(event) => setWbsId(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">{M.unfiled}</option>
            {deliverableOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Button type="submit" pending={pending} data-testid="canvas-create">
        {canvas ? messages.actions.save : M.create}
      </Button>
    </form>
  );
}
