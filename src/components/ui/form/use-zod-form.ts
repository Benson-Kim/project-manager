"use client";

import { useCallback, useState } from "react";
import { z } from "zod";
import type { ActionResult } from "@/lib/action";
import { blursTowardSubmit } from "./blur-toward-submit";
import { focusFirstInvalid } from "./focus-first-invalid";

/**
 * Client-side half of the form pattern ): validate the SAME zod
 * schema as the server on blur and on submit, and merge server fieldErrors
 * from the ActionResult. The server stays authoritative.
 *
 * Usage:
 *   const form = useZodForm(createSupplierInput);
 *   <form action={formAction} onBlur={form.onBlur} noValidate>
 *     <Field name="name" label={…} errors={form.errors.name}>…</Field>
 */
export function useZodForm<TSchema extends z.ZodType>(schema: TSchema) {
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const validate = useCallback(
    (source: HTMLFormElement | FormData, onlyField?: string): boolean => {
      const data = source instanceof FormData ? source : new FormData(source);
      const values = Object.fromEntries(data.entries());
      const parsed = schema.safeParse(values);
      if (parsed.success) {
        setErrors(onlyField ? (prev) => ({ ...prev, [onlyField]: [] }) : {});
        return true;
      }
      const next: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_";
        (next[key] ??= []).push(issue.message);
      }
      setErrors((prev) => (onlyField ? { ...prev, [onlyField]: next[onlyField] ?? [] } : next));
      if (!onlyField && source instanceof HTMLFormElement) {
        requestAnimationFrame(() => focusFirstInvalid(source));
      }
      return false;
    },
    [schema],
  );

  /** Attach to the <form> — validates the blurred field via event delegation. */
  const onBlur = useCallback(
    (event: React.FocusEvent<HTMLFormElement>) => {
      const target = event.target as HTMLElement & { name?: string };
      const formElement = event.currentTarget;
      if (
        target.name &&
        formElement instanceof HTMLFormElement &&
        !blursTowardSubmit(formElement, event.relatedTarget)
      ) {
        validate(formElement, target.name);
      }
    },
    [validate],
  );

  /** Merge server-side field errors from an ActionResult. */
  const applyResult = useCallback((result: ActionResult<unknown> | null | undefined) => {
    if (result && !result.ok && result.error.fieldErrors) {
      setErrors(result.error.fieldErrors);
    }
  }, []);

  const reset = useCallback(() => setErrors({}), []);

  return { errors, validate, onBlur, applyResult, reset };
}
