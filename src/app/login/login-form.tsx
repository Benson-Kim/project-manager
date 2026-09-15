"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { messages } from "@/lib/messages";
import { loginAction } from "@/modules/auth/actions";
import { loginInput } from "@/modules/auth/schemas/user";

/**
 * The ONE form pattern (ADR-0009): visible labels, blur+submit validation via
 * the shared zod schema, pending state, error summary that takes focus.
 * The failure message is a single generic sentence — it never reveals whether
 * the username exists (STANDARDS §4).
 */
export function LoginForm() {
  const [result, formAction, pending] = useActionState(loginAction, null);
  const form = useZodForm(loginInput);

  const serverError = result && !result.ok ? result.error.message : null;

  return (
    <form
      action={formAction}
      noValidate
      onBlur={form.onBlur}
      onSubmit={(e) => {
        if (!form.validate(e.currentTarget)) e.preventDefault();
      }}
      className="flex flex-col gap-4"
    >
      <ErrorSummary message={serverError} />
      <Field label={messages.auth.username} name="username" errors={form.errors.username}>
        <Input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
        />
      </Field>
      <Field label={messages.auth.password} name="password" errors={form.errors.password}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" pending={pending}>
        {pending ? messages.auth.signingIn : messages.auth.signIn}
      </Button>
    </form>
  );
}
