"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DialogActions } from "@/components/ui/dialog";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { firstError } from "@/modules/key-deliverables/components/wbs-queue";
import { createBoardFromChecklistAction } from "../actions";
import { BOARD_METHODS, type BoardMethod } from "../schemas/board";
import { BOARD_NAME_MAX } from "../schemas/board-rules";
import { notifySaved } from "@/lib/cross-window";

const M = messages.checklists;

/** Names a board made from one checklist, picks Kanban or Scrum, and opens the new board. */
export function BoardFromChecklistForm({
  projectId,
  checklistId,
  defaultName,
  onDone,
}: {
  projectId: number;
  checklistId: number;
  defaultName: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [method, setMethod] = useState<BoardMethod>("kanban");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createBoardFromChecklistAction({ checklistId, projectId, name, method });
      if (!result.ok) return setError(firstError(result.error));
      notifySaved();
      onDone();
      router.push(`/projects/${projectId}/boards/${result.data.BoardId}`);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 text-left">
      <p className="text-sm">{M.makeBoardBody}</p>
      <Field label={M.boardName} name="boardName" errors={error ? [error] : undefined}>
        <Input
          name="boardName"
          data-testid="checklist-board-name"
          value={name}
          maxLength={BOARD_NAME_MAX}
          required
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
      </Field>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-sm font-medium">{M.boardMethod}</legend>
        {BOARD_METHODS.map((each) => (
          <label key={each} className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="radio"
              name="boardMethod"
              value={each}
              data-testid={`checklist-board-${each}`}
              checked={method === each}
              onChange={() => setMethod(each)}
            />
            {M.methods[each]}
          </label>
        ))}
      </fieldset>
      <DialogActions onCancel={onDone}>
        <Button type="submit" pending={pending} data-testid="checklist-board-save">
          {M.create}
        </Button>
      </DialogActions>
    </form>
  );
}
