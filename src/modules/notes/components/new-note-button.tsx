"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { createNoteAction } from "../actions";

/** "New notebook": creates an untitled notebook with one empty page and opens its workspace. */
export function NewNoteButton({ projectId }: { projectId: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      const result = await createNoteAction({ projectId, title: messages.notes.untitled });
      if (result.ok) {
        router.push(`/projects/${projectId}/notes/${result.data.NoteId}`);
      } else if (result.error.code === "UNAUTHENTICATED") {
        router.push("/login?reason=expired");
      } else {
        toast({ variant: "error", title: result.error.message });
      }
    });

  return (
    <Button pending={pending} onClick={create} data-testid="new-note">
      {messages.notes.newNote}
    </Button>
  );
}
