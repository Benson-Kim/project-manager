"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { messages } from "@/lib/messages";
import type { ActionResult } from "@/lib/action";
import { signInWithDatabase, type DesktopDatabaseBridge } from "@/lib/desktop-database";
import { loginAction } from "@/modules/auth/actions";
import { loginInput } from "@/modules/auth/schemas/user";

/**
 * The ONE form pattern ): visible labels, blur+submit validation via
 * the shared zod schema, pending state, error summary that takes focus.
 * The failure message is a single generic sentence — it never reveals whether
 * the username exists (STANDARDS §4).
 */
export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const submitting = useRef(false);
  const [result, formAction, pending] = useActionState(
    async (prev: ActionResult<never> | null, formData: FormData) => {
      try {
        return await signInWithDatabase(
          (window as Window & { desktop?: DesktopDatabaseBridge }).desktop,
          () => loginAction(prev, formData),
          setConnecting,
        );
      } finally {
        submitting.current = false;
      }
    },
    null,
  );
  const form = useZodForm(loginInput);

  const serverError = result && !result.ok ? result.error.message : null;

  return (
    <form
      action={formAction}
      noValidate
      onBlur={form.onBlur}
      onSubmit={(e) => {
        if (submitting.current || pending || !form.validate(e.currentTarget)) {
          e.preventDefault();
          return;
        }
        submitting.current = true;
      }}
      className="flex flex-col gap-4"
    >
      <ErrorSummary message={serverError} />
      <Field label={messages.auth.username} name="username" errors={form.errors.username}>
        <Input
          name="username"
          value={username}
          onChange={(e) => setUsername(e.currentTarget.value)}
          readOnly={pending}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
        />
      </Field>
      <Field label={messages.auth.password} name="password" errors={form.errors.password}>
        <Input
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          readOnly={pending}
          autoComplete="current-password"
          required
        />
      </Field>
      <Button type="submit" pending={pending}>
        {connecting
          ? messages.auth.connecting
          : pending
            ? messages.auth.signingIn
            : messages.auth.signIn}
      </Button>
    </form>
  );
}
