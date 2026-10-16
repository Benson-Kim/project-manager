"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAnnouncer } from "@/components/ui/announcer";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action";
import { messages } from "@/lib/messages";

/**
 * One outcome rule for every financials form (ADR-0029): success toasts,
 * announces and refreshes the page's sheet; an expired session goes to sign-in;
 * failures keep the form open with the server's field errors and message, and
 * CONFLICT offers Reload.
 */
export function useFinancialAction() {
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [conflict, setConflict] = useState(false);

  const reset = useCallback(() => {
    setSummary(null);
    setFieldErrors({});
    setConflict(false);
  }, []);

  const run = useCallback(
    <T>(
      call: () => Promise<ActionResult<T>>,
      {
        success = messages.feedback.saved,
        onSuccess,
      }: { success?: string; onSuccess?: (data: T) => void } = {},
    ) => {
      reset();
      startTransition(async () => {
        const result = await call();
        if (result.ok) {
          toast({ variant: "success", title: success });
          announce(success);
          onSuccess?.(result.data);
          router.refresh();
          return;
        }
        if (result.error.code === "UNAUTHENTICATED") {
          router.push("/login?reason=expired");
          return;
        }
        setFieldErrors(result.error.fieldErrors ?? {});
        setSummary(result.error.message);
        setConflict(result.error.code === "CONFLICT");
      });
    },
    [announce, reset, router, toast],
  );

  const reload = useCallback(() => {
    reset();
    router.refresh();
  }, [reset, router]);

  return {
    run,
    pending,
    summary,
    fieldErrors,
    conflict,
    reset,
    reload,
    setSummary,
    setFieldErrors,
  };
}

/** Field errors of one path ("amounts.0.amount") or of everything under a prefix. */
export function errorsAt(errors: Record<string, string[]>, path: string): string[] | undefined {
  return errors[path];
}
