"use client";

import { useState, useTransition } from "react";
import type { z } from "zod";
import type { ActionResult } from "@/lib/action";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Select } from "@/components/ui/form/inputs";
import { useToast } from "@/components/ui/toast";
import { ROLES, type Role } from "@/lib/auth/types";
import { messages } from "@/lib/messages";
import {
  createUserAction,
  deactivateUserAction,
  resetUserPasswordAction,
  updateUserAction,
} from "../actions/users";
import {
  adminCreateUserInput,
  adminResetPasswordInput,
  adminUpdateUserInput,
} from "../schemas/user";

const U = messages.settings.users;

/** One row of Settings > Users, as the page passes it down. */
export interface AdminUser {
  userId: number;
  username: string;
  displayName: string;
  email: string | null;
  role: Role;
  isActive: boolean;
  rowVer: number;
}

type FieldErrors = Record<string, string[]>;
type Save = (input: unknown) => Promise<ActionResult<unknown>>;

/**
 * Checks the values with the server's own schema, then sends the raw values (the action parses
 * them again; the server stays authoritative). A refusal shows its message and field errors.
 */
function useSave() {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);

  function submit(schema: z.ZodType, values: unknown, save: Save, done: string, close: () => void) {
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues)
        (next[issue.path.join(".") || "_"] ??= []).push(issue.message);
      setErrors(next);
      return;
    }
    setErrors({});
    setError(null);
    start(async () => {
      try {
        const result = await save(values);
        if (result.ok) {
          toast({ variant: "success", title: done });
          close();
        } else {
          setErrors(result.error.fieldErrors ?? {});
          setError(result.error.message);
        }
      } catch {
        setError(messages.errors.INTERNAL);
      }
    });
  }

  function reset() {
    setErrors({});
    setError(null);
  }

  return { pending, errors, error, submit, reset };
}

function FormDialog({
  title,
  description,
  submitLabel,
  pending,
  error,
  close,
  onSubmit,
  children,
}: {
  title: string;
  description?: string;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  close: () => void;
  onSubmit: (values: Record<string, FormDataEntryValue>) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
      title={title}
      description={description}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(Object.fromEntries(new FormData(event.currentTarget)));
        }}
      >
        <ErrorSummary message={error} />
        <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
          {children}
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={pending} onClick={close}>
            {messages.actions.cancel}
          </Button>
          <Button type="submit" pending={pending}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function TemporaryPasswordField({ errors }: { errors?: string[] }) {
  return (
    <Field name="temporaryPassword" label={U.temporaryPassword} errors={errors}>
      <Input name="temporaryPassword" type="password" autoComplete="new-password" />
    </Field>
  );
}

function ProfileFields({
  errors,
  user,
  roleLocked = false,
}: {
  errors: FieldErrors;
  user?: AdminUser;
  roleLocked?: boolean;
}) {
  const [role, setRole] = useState<string>(user?.role ?? "User");
  return (
    <>
      <Field name="displayName" label={U.displayName} errors={errors.displayName}>
        <Input name="displayName" defaultValue={user?.displayName} autoComplete="off" />
      </Field>
      <Field name="email" label={U.email} errors={errors.email}>
        <Input name="email" type="email" defaultValue={user?.email ?? ""} autoComplete="off" />
      </Field>
      <Field name="role" label={U.role} errors={errors.role}>
        <Select
          name={roleLocked ? undefined : "role"}
          value={role}
          disabled={roleLocked}
          onChange={(event) => setRole(event.target.value)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {U.roles[r]}
            </option>
          ))}
        </Select>
        {roleLocked ? (
          <input type="hidden" name="role" value={role} />
        ) : user && role !== user.role ? (
          <p className="text-sm text-ink-muted">{U.roleChangeBody(user.displayName)}</p>
        ) : null}
      </Field>
    </>
  );
}

export function AddUserButton() {
  const [open, setOpen] = useState(false);
  const save = useSave();
  const close = () => {
    setOpen(false);
    save.reset();
  };
  return (
    <>
      <Button data-testid="add-user" onClick={() => setOpen(true)}>
        {U.add}
      </Button>
      {open ? (
        <FormDialog
          title={U.add}
          submitLabel={U.add}
          pending={save.pending}
          error={save.error}
          close={close}
          onSubmit={(values) =>
            save.submit(adminCreateUserInput, values, createUserAction, U.created, close)
          }
        >
          <Field name="username" label={U.username} errors={save.errors.username}>
            <Input name="username" autoComplete="off" />
          </Field>
          <ProfileFields errors={save.errors} />
          <TemporaryPasswordField errors={save.errors.temporaryPassword} />
        </FormDialog>
      ) : null}
    </>
  );
}

type Open = "edit" | "reset" | "deactivate" | null;

/**
 * Edit, Reset password and Deactivate/Reactivate for one row. Your own row cannot change its role,
 * deactivate or reset (you use Change password); the procs refuse those and the last active
 * Admin anyway, so these controls only spare a refusal.
 */
export function UserActions({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const [open, setOpen] = useState<Open>(null);
  const save = useSave();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const close = () => {
    setOpen(null);
    save.reset();
  };

  const toggleActive = (run: Save, input: unknown, done: string) =>
    start(async () => {
      try {
        const result = await run(input);
        toast(
          result.ok
            ? { variant: "success", title: done }
            : { variant: "error", title: result.error.message },
        );
        if (result.ok) close();
      } catch {
        toast({ variant: "error", title: messages.errors.INTERNAL });
      }
    });

  const fixed = { userId: user.userId, isActive: user.isActive, rowVer: user.rowVer };

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="secondary" size="compact" onClick={() => setOpen("edit")}>
        {U.edit}
      </Button>
      {!isSelf ? (
        <Button variant="secondary" size="compact" onClick={() => setOpen("reset")}>
          {U.resetPassword}
        </Button>
      ) : null}
      {!isSelf && user.isActive ? (
        <Button variant="secondary" size="compact" onClick={() => setOpen("deactivate")}>
          {U.deactivate}
        </Button>
      ) : null}
      {!user.isActive ? (
        <Button
          variant="secondary"
          size="compact"
          pending={busy}
          onClick={() =>
            toggleActive(
              updateUserAction,
              {
                ...fixed,
                displayName: user.displayName,
                email: user.email ?? "",
                role: user.role,
                isActive: true,
              },
              U.reactivatedToast,
            )
          }
        >
          {U.reactivate}
        </Button>
      ) : null}

      {open === "edit" ? (
        <FormDialog
          title={U.edit}
          submitLabel={messages.actions.save}
          pending={save.pending}
          error={save.error}
          close={close}
          onSubmit={(values) =>
            save.submit(
              adminUpdateUserInput,
              { ...values, ...fixed },
              updateUserAction,
              messages.feedback.saved,
              close,
            )
          }
        >
          <ProfileFields errors={save.errors} user={user} roleLocked={isSelf} />
        </FormDialog>
      ) : null}

      {open === "reset" ? (
        <FormDialog
          title={U.resetTitle(user.displayName)}
          description={U.resetBody(user.displayName)}
          submitLabel={U.resetPassword}
          pending={save.pending}
          error={save.error}
          close={close}
          onSubmit={(values) =>
            save.submit(
              adminResetPasswordInput,
              { ...values, userId: user.userId },
              resetUserPasswordAction,
              U.reset,
              close,
            )
          }
        >
          <TemporaryPasswordField errors={save.errors.temporaryPassword} />
        </FormDialog>
      ) : null}

      <ConfirmDialog
        open={open === "deactivate"}
        onOpenChange={(next) => {
          if (!next && !busy) close();
        }}
        title={U.deactivateTitle(user.displayName)}
        body={U.deactivateBody(user.displayName)}
        confirmLabel={U.deactivate}
        pending={busy}
        onConfirm={() =>
          toggleActive(
            deactivateUserAction,
            { userId: user.userId, rowVer: user.rowVer },
            U.deactivatedToast,
          )
        }
      />
    </div>
  );
}
