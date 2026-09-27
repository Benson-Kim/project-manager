"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { messages } from "@/lib/messages";
import { changePasswordAction } from "@/modules/auth/actions";
import { changePasswordInput } from "@/modules/auth/schemas/user";

/** form pattern; server fieldErrors are merged into the field rows. */
export function ChangePasswordForm() {
  const [result, formAction, pending] = useActionState(changePasswordAction, null);
  const form = useZodForm(changePasswordInput);

  const serverError = result && !result.ok ? result.error.message : null;
  const serverFieldErrors = result && !result.ok ? (result.error.fieldErrors ?? {}) : {};
  const errorsFor = (name: string) => [
    ...(form.errors[name] ?? []),
    ...(serverFieldErrors[name] ?? []),
  ];

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
      <Field
        label={messages.auth.currentPassword}
        name="currentPassword"
        errors={errorsFor("currentPassword")}
      >
        <Input name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label={messages.auth.newPassword} name="newPassword" errors={errorsFor("newPassword")}>
        <Input name="newPassword" type="password" autoComplete="new-password" required />
      </Field>
      <Field
        label={messages.auth.confirmPassword}
        name="confirmPassword"
        errors={errorsFor("confirmPassword")}
      >
        <Input name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" pending={pending}>
        {pending ? messages.auth.changingPassword : messages.auth.changePassword}
      </Button>
    </form>
  );
}
