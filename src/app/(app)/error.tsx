"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/states";
import { messages } from "@/lib/messages";

/** Template segment error boundary with retry — one per module route segment. */
export default function ErrorBoundary({
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
      <ErrorState title={messages.app.errorBody} onRetry={reset} />
    </div>
  );
}
