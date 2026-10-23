"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { createNoteAction } from "../actions";
import { noteHref } from "../note-links";

/**
 * "New notebook": creates an untitled notebook with one empty page and opens its
 * workspace. A null project puts it in the project-less shared space.
 */
export function NewNoteButton({ projectId }: { projectId: number | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      const result = await createNoteAction({ projectId, title: messages.notes.untitled });
      if (result.ok) {
        router.push(noteHref(result.data));
      } else if (result.error.code === "UNAUTHENTICATED") {
        router.push("/login?reason=expired");
      } else {
        toast({ variant: "error", title: result.error.message });
      }
    });

  return (
    <Button pending={pending} onClick={create} data-testid="new-note">
      {projectId === null ? messages.notes.newSharedNote : messages.notes.newNote}
    </Button>
  );
}
