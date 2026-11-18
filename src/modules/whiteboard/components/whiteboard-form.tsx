"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DialogActions } from "@/components/ui/dialog";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { notifySaved } from "@/lib/cross-window";
import { messages } from "@/lib/messages";
import { firstError } from "@/modules/key-deliverables/components/wbs-queue";
import { createWhiteboardAction, renameWhiteboardAction } from "../actions";
import { WHITEBOARD_NAME_MAX } from "../schemas/whiteboard";
import type { WithRowVer } from "./use-whiteboard-save";

const M = messages.whiteboard;

/** Names a new whiteboard, or with `rename`, renames the open one between the editor's saves. */
export function WhiteboardForm({
  projectId,
  rename,
  onDone,
}: {
  projectId: number;
  rename?: { whiteboardId: number; name: string; withRowVer: WithRowVer };
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
          renameWhiteboardAction({ whiteboardId: rename.whiteboardId, name, rowVer }),
        );
        if (!result.ok) return setError(firstError(result.error));
        onDone?.();
        return;
      }
      const result = await createWhiteboardAction({ projectId, name });
      if (!result.ok) return setError(firstError(result.error));
      notifySaved();
      onDone?.();
      router.push(`?board=${result.data.WhiteboardId}`);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 text-left">
      <Field label={M.nameLabel} name="name" errors={error ? [error] : undefined}>
        <Input
          name="name"
          data-testid="whiteboard-name"
          value={name}
          maxLength={WHITEBOARD_NAME_MAX}
          required
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
      </Field>
      <DialogActions onCancel={onDone}>
        <Button type="submit" pending={pending} data-testid="whiteboard-save">
          {rename ? messages.actions.save : M.create}
        </Button>
      </DialogActions>
    </form>
  );
}
