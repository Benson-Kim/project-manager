"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-styles";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { failureMessage } from "@/components/ui/data-view/datasheet";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Select } from "@/components/ui/form/inputs";
import type { ActionResult } from "@/lib/action";
import {
  ACTION_KINDS,
  ACTION_KIND_LABELS,
  COLUMN_KIND_SPECS,
  COLUMN_NAME_MAX,
  newColumnSchema,
  type ActionKind,
  type ColumnKind,
  type CustomColumnDef,
} from "@/lib/custom-columns/kinds";
import { messages } from "@/lib/messages";

const M = messages.customColumns;

/**
 * "+ Add column" (ADR-0066): a name, what the column holds, and for a button what it does. The
 * owner passes the kinds it offers and its create action; the form checks with the shared rule
 * first, and the server checks again.
 */
export function AddColumnButton({
  kinds,
  actionKinds = ACTION_KINDS,
  onAdd,
}: {
  kinds: readonly ColumnKind[];
  actionKinds?: readonly ActionKind[];
  onAdd: (column: {
    name: string;
    kind: ColumnKind;
    actionKind?: ActionKind;
  }) => Promise<ActionResult<unknown>>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ColumnKind>(kinds[0] ?? "text");
  const [actionKind, setActionKind] = useState<ActionKind>(actionKinds[0] ?? "signoff");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setName("");
    setKind(kinds[0] ?? "text");
    setActionKind(actionKinds[0] ?? "signoff");
    setError(null);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const column = { name, kind, actionKind: kind === "action" ? actionKind : undefined };
    const checked = newColumnSchema.safeParse(column);
    if (!checked.success) return setError(checked.error.issues[0]?.message ?? M.badValue);
    startTransition(async () => {
      const result = await onAdd(checked.data);
      if (!result.ok) return setError(failureMessage(result.error));
      setOpen(false);
      reset();
    });
  };

  return (
    <>
      <button
        type="button"
        className={buttonClass("secondary", "compact")}
        data-testid="add-column"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        {M.addColumn}
      </button>
      <Dialog open={open} onOpenChange={setOpen} title={M.addColumnTitle}>
        <form onSubmit={submit} className="flex flex-col gap-3 text-left">
          <Field label={M.columnName} name="name">
            <Input
              name="name"
              value={name}
              maxLength={COLUMN_NAME_MAX}
              required
              data-testid="add-column-name"
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
          </Field>
          <Field label={M.columnKind} name="kind">
            <Select
              name="kind"
              value={kind}
              data-testid="add-column-kind"
              onChange={(event) => setKind(event.target.value as ColumnKind)}
            >
              {kinds.map((each) => (
                <option key={each} value={each}>
                  {COLUMN_KIND_SPECS[each].label}
                </option>
              ))}
            </Select>
          </Field>
          {kind === "action" ? (
            <Field label={M.buttonDoes} name="actionKind">
              <Select
                name="actionKind"
                value={actionKind}
                data-testid="add-column-action"
                onChange={(event) => setActionKind(event.target.value as ActionKind)}
              >
                {actionKinds.map((each) => (
                  <option key={each} value={each}>
                    {ACTION_KIND_LABELS[each]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <ErrorSummary message={error} />
          <DialogActions onCancel={() => setOpen(false)}>
            <Button type="submit" pending={pending} data-testid="add-column-save">
              {M.add}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}

export interface ManagedColumn extends CustomColumnDef {
  rowVer: number;
}

/**
 * "Columns": rename each added column, move it left or right, or delete it with its values. The
 * delete states its consequence first; the owner decides who may delete.
 */
export function ColumnsButton({
  columns,
  canDelete,
  onRename,
  onMove,
  onDelete,
}: {
  columns: readonly ManagedColumn[];
  canDelete: boolean;
  onRename: (column: ManagedColumn, name: string) => Promise<ActionResult<unknown>>;
  onMove: (column: ManagedColumn, direction: -1 | 1) => Promise<ActionResult<unknown>>;
  onDelete: (column: ManagedColumn) => Promise<ActionResult<unknown>>;
}) {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ManagedColumn | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (act: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const result = await act();
      if (!result.ok) return setError(failureMessage(result.error));
      after?.();
    });

  const nameOf = (column: ManagedColumn) => names[column.id] ?? column.name;

  return (
    <>
      <button
        type="button"
        className={buttonClass("secondary", "compact")}
        data-testid="manage-columns"
        onClick={() => {
          setNames({});
          setError(null);
          setOpen(true);
        }}
      >
        {M.columns}
      </button>
      <Dialog open={open} onOpenChange={setOpen} title={M.columnsTitle} description={M.columnsHint}>
        <div className="flex flex-col gap-2" data-testid="columns-dialog">
          {columns.length === 0 ? <p className="text-sm text-ink-muted">{M.noColumns}</p> : null}
          {columns.map((column, index) => (
            <form
              key={column.id}
              className="flex items-center gap-1"
              data-testid="columns-dialog-row"
              onSubmit={(event) => {
                event.preventDefault();
                run(() => onRename(column, nameOf(column)));
              }}
            >
              <Input
                aria-label={M.columnName}
                className="min-w-0 flex-1"
                value={nameOf(column)}
                maxLength={COLUMN_NAME_MAX}
                required
                data-testid="columns-dialog-name"
                onChange={(event) => setNames({ ...names, [column.id]: event.target.value })}
              />
              <span className="w-24 shrink-0 truncate text-xs text-ink-muted">
                {COLUMN_KIND_SPECS[column.kind].label}
              </span>
              <button
                type="submit"
                className={buttonClass("secondary", "compact")}
                disabled={pending || nameOf(column).trim() === column.name}
                data-testid="columns-dialog-save"
              >
                {M.save}
              </button>
              <button
                type="button"
                className={buttonClass("ghost", "compact")}
                aria-label={`${M.moveLeft}: ${column.name}`}
                disabled={pending || index === 0}
                onClick={() => run(() => onMove(column, -1))}
              >
                ←
              </button>
              <button
                type="button"
                className={buttonClass("ghost", "compact")}
                aria-label={`${M.moveRight}: ${column.name}`}
                disabled={pending || index === columns.length - 1}
                onClick={() => run(() => onMove(column, 1))}
              >
                →
              </button>
              {canDelete ? (
                <button
                  type="button"
                  className={buttonClass("danger", "compact")}
                  aria-label={`${M.deleteColumn}: ${column.name}`}
                  disabled={pending}
                  data-testid="columns-dialog-delete"
                  onClick={() => setDeleting(column)}
                >
                  ×
                </button>
              ) : null}
            </form>
          ))}
          <ErrorSummary message={error} />
        </div>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(isOpen) => !isOpen && setDeleting(null)}
        title={M.deleteColumn}
        body={deleting ? M.deleteColumnPrompt(deleting.name) : ""}
        confirmLabel={messages.actions.delete}
        pending={pending}
        onConfirm={() => {
          const column = deleting;
          if (column)
            run(
              () => onDelete(column),
              () => setDeleting(null),
            );
        }}
      />
    </>
  );
}
