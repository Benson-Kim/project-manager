"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-styles";
import { Dialog } from "@/components/ui/dialog";
import { failureMessage } from "@/components/ui/data-view/datasheet";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action";
import { LINK_CELL_MAX, isWebAddress, normaliseWebAddress } from "@/lib/custom-columns/kinds";
import { formatDateTime } from "@/lib/format";
import { messages } from "@/lib/messages";

const M = messages.customColumns;

/** Runs a cell action; a refusal shows as a toast and leaves the cell as it was. */
function useCellAction() {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const run = (act: () => Promise<ActionResult<unknown>>) =>
    startTransition(async () => {
      const result = await act();
      if (!result.ok) toast({ variant: "error", title: failureMessage(result.error) });
    });
  return { pending, run };
}

/** The address a link shows: its host and path, without the scheme. */
export function linkLabel(href: string): string {
  try {
    const url = new URL(href);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.host}${path}`;
  } catch {
    return href;
  }
}

/**
 * A document link cell: the link opens in a new tab with no access back to this page; who may
 * edit gets a button that sets or clears it. Only http and https addresses are ever rendered.
 */
export function DocumentLinkCell({
  href,
  column,
  canEdit,
  onSave,
}: {
  href: string | null;
  column: string;
  canEdit: boolean;
  onSave: (value: string) => Promise<ActionResult<unknown>>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(href ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const safe = href && isWebAddress(href) ? href : null;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = normaliseWebAddress(value);
    if (next !== "" && !isWebAddress(next)) return setError(M.badLink);
    startTransition(async () => {
      const result = await onSave(next);
      if (!result.ok) return setError(failureMessage(result.error));
      setOpen(false);
    });
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      {safe ? (
        <a
          href={safe}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-accent-strong underline underline-offset-2"
          title={safe}
          data-testid="custom-cell-link"
        >
          {linkLabel(safe)}
        </a>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          className="shrink-0 rounded px-1 text-xs text-ink-muted hover:bg-hover"
          aria-label={safe ? M.editLink(column) : M.addLink(column)}
          data-testid="custom-cell-link-edit"
          onClick={() => {
            setValue(href ?? "");
            setError(null);
            setOpen(true);
          }}
        >
          {safe ? "✎" : "+"}
        </button>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen} title={column}>
        <form noValidate onSubmit={submit} className="flex flex-col items-stretch gap-2 sm:w-96">
          <Field label={M.kinds.document} name="link" errors={error ? [error] : undefined}>
            <Input
              name="link"
              type="url"
              inputMode="url"
              value={value}
              maxLength={LINK_CELL_MAX}
              placeholder="https://"
              data-testid="custom-cell-link-input"
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
            />
          </Field>
          <Button type="submit" pending={pending} data-testid="custom-cell-link-save">
            {M.save}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}

/** A sign-off button: signs with who and when, or clears the sign-off. */
export function SignOffCell({
  signedAt,
  signedBy,
  column,
  canEdit,
  onSet,
}: {
  signedAt: string | null;
  signedBy: string | null;
  column: string;
  canEdit: boolean;
  onSet: (signed: boolean) => Promise<ActionResult<unknown>>;
}) {
  const { pending, run } = useCellAction();
  if (signedAt) {
    const text = M.signedOff(signedBy ?? "", formatDateTime(signedAt));
    return (
      <span className="flex min-w-0 items-center gap-1 text-xs" data-testid="custom-cell-signed">
        <span className="truncate" title={text}>
          ✓ {signedBy} · {formatDateTime(signedAt)}
        </span>
        {canEdit ? (
          <button
            type="button"
            className="shrink-0 rounded px-1 text-ink-muted hover:bg-hover"
            aria-label={M.clearSignOff(column)}
            disabled={pending}
            onClick={() => run(() => onSet(false))}
          >
            ×
          </button>
        ) : null}
      </span>
    );
  }
  return canEdit ? (
    <button
      type="button"
      className={buttonClass("secondary", "compact")}
      disabled={pending}
      data-testid="custom-cell-signoff"
      onClick={() => run(() => onSet(true))}
    >
      {M.signOff}
    </button>
  ) : null;
}

/** A "Create to-do" button; once the to-do exists the cell links to it. */
export function TodoCell({
  todoHref,
  canRun,
  onRun,
}: {
  todoHref: string | null;
  canRun: boolean;
  onRun: () => Promise<ActionResult<unknown>>;
}) {
  const { pending, run } = useCellAction();
  if (todoHref) {
    return (
      <Link
        href={todoHref}
        className="text-xs text-accent-strong underline underline-offset-2"
        data-testid="custom-cell-todo-link"
      >
        {M.openTodo}
      </Link>
    );
  }
  return canRun ? (
    <button
      type="button"
      className={buttonClass("secondary", "compact")}
      disabled={pending}
      data-testid="custom-cell-todo"
      onClick={() => run(onRun)}
    >
      {M.makeTodo}
    </button>
  ) : null;
}
