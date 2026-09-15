"use client";

import { useEffect, useRef } from "react";
import { messages } from "@/lib/messages";

/**
 * Server-failure summary (ADR-0009): appears above the form and takes focus so
 * keyboard and screen-reader users land on the explanation.
 */
export function ErrorSummary({ message }: { message: string | null }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);

  if (!message) return null;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="rounded-md border border-danger bg-danger-soft p-3 text-sm text-ink"
    >
      <p className="font-medium">{messages.errors.summaryTitle}</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}
