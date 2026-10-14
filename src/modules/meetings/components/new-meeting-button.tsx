"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { createMeetingDraftAction } from "../actions";

/**
 * "New meeting" (checklist row 53): creates an untitled draft in the project
 * and opens its workspace, where the header is filled in and saved.
 */
export function NewMeetingButton({ projectId }: { projectId: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      const result = await createMeetingDraftAction({ projectId });
      if (result.ok) {
        router.push(`/projects/${projectId}/meetings/${result.data.MeetingId}`);
      } else if (result.error.code === "UNAUTHENTICATED") {
        router.push("/login?reason=expired");
      } else {
        toast({ variant: "error", title: result.error.message });
      }
    });

  return (
    <Button pending={pending} onClick={create} data-testid="new-meeting">
      {messages.meetings.newMeeting}
    </Button>
  );
}
