"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/states";
import { messages } from "@/lib/messages";

/** Segment error boundary for /projects. */
export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="py-8">
      <ErrorState title={messages.list.errorTitle} onRetry={reset} />
    </div>
  );
}
