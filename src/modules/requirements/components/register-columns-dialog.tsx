"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-styles";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { failureMessage } from "@/components/ui/data-view/datasheet";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Select, Textarea } from "@/components/ui/form/inputs";
import type { ActionResult } from "@/lib/action";
import {
  COLUMN_KIND_SPECS,
  COLUMN_NAME_MAX,
  CHOICE_LABEL_MAX,
  REGISTER_KINDS,
} from "@/lib/custom-columns/kinds";
import { messages } from "@/lib/messages";
import {
  clearColumnLabelAction,
  createChoiceAction,
  createRegisterColumnAction,
  deleteChoiceAction,
  deleteRegisterColumnAction,
  moveRegisterColumnAction,
  renameChoiceAction,
  renameRegisterColumnAction,
  setColumnLabelAction,
  setRegisterColumnKindAction,
} from "../actions/register-columns";
import {
  MAX_REGISTER_COLUMNS,
  REGISTER_BUILT_IN_COLUMNS,
  type ColumnLabel,
  type RegisterColumn,
} from "../schemas/register-columns";

const M = messages.requirements.columns;
const C = messages.customColumns;
type RegisterKind = (typeof REGISTER_KINDS)[number];

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

/** One name box with its own Save: what a rename of any column looks like here. */
function NameRow({
  label,
  name,
  testId,
  pending,
  onSave,
  children,
}: {
  label: string;
  name: string;
  testId: string;
  pending: boolean;
  onSave: (name: string) => void;
  children?: React.ReactNode;
}) {
  const [value, setValue] = useState(name);
  const [prev, setPrev] = useState(name);
  if (prev !== name) {
    setPrev(name);
    setValue(name);
  }
  return (
    <form
      className="flex flex-wrap items-center gap-1"
      data-testid={testId}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value);
      }}
    >
      <Input
        aria-label={label}
        className="min-w-0 flex-1"
        value={value}
        maxLength={COLUMN_NAME_MAX}
        required
        data-testid={`${testId}-name`}
        onChange={(event) => setValue(event.target.value)}
      />
      <button
        type="submit"
        className={buttonClass("secondary", "compact")}
        disabled={pending || value.trim() === name}
        data-testid={`${testId}-save`}
      >
        {C.save}
      </button>
      {children}
    </form>
  );
}

/**
 * The register's columns (ADR-0067): rename any built-in column for this project (only its heading
 * changes) or give it its default name back; add up to five columns of your own, rename, move,
 * change what one holds while it is empty, edit a choice list's choices, or delete one with its
 * values, which an administrator can restore.
 */
export function RegisterColumnsButton({
  projectId,
  labels,
  columns,
  can,
}: {
  projectId: number;
  labels: readonly ColumnLabel[];
  columns: readonly RegisterColumn[];
  can: { create: boolean; update: boolean; delete: boolean };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<RegisterColumn | null>(null);
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<RegisterKind>("text");
  const [newChoices, setNewChoices] = useState("");
  const [kindDraft, setKindDraft] = useState<
    Record<number, { kind: RegisterKind; choices: string }>
  >({});
  const [choiceDraft, setChoiceDraft] = useState<Record<number, string>>({});

  const run = (act: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const result = await act();
      if (!result.ok) return setError(failureMessage(result.error));
      after?.();
      router.refresh();
    });

  const labelOf = (key: string) => labels.find((label) => label.ColumnKey === key);

  return (
    <>
      <button
        type="button"
        className={buttonClass("secondary")}
        data-testid="register-columns"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {M.open}
      </button>
      <Dialog open={open} onOpenChange={setOpen} title={M.title} description={M.hint} wide>
        <div
          className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto"
          data-testid="register-columns-dialog"
        >
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-ink">{M.builtIn}</h3>
            {REGISTER_BUILT_IN_COLUMNS.map((column) => {
              const label = labelOf(column.key);
              const name = label?.Label ?? column.name;
              return (
                <div key={column.key} className="flex flex-col gap-0.5">
                  <NameRow
                    label={M.rename(name)}
                    name={name}
                    testId={`register-label-${column.key}`}
                    pending={pending || !can.update}
                    onSave={(value) =>
                      run(() =>
                        setColumnLabelAction({
                          projectId,
                          columnKey: column.key,
                          label: value,
                          rowVer: label?.RowVer ?? null,
                        }),
                      )
                    }
                  >
                    {label && can.update ? (
                      <button
                        type="button"
                        className={buttonClass("ghost", "compact")}
                        disabled={pending}
                        aria-label={M.resetLabel(name)}
                        data-testid={`register-label-${column.key}-reset`}
                        onClick={() =>
                          run(() =>
                            clearColumnLabelAction({
                              projectId,
                              columnKey: column.key,
                              rowVer: label.RowVer,
                            }),
                          )
                        }
                      >
                        {M.reset}
                      </button>
                    ) : null}
                  </NameRow>
                  {label ? (
                    <span className="text-xs text-ink-muted">{M.defaultName(column.name)}</span>
                  ) : null}
                </div>
              );
            })}
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-ink">{M.added}</h3>
            {columns.length === 0 ? <p className="text-sm text-ink-muted">{C.noColumns}</p> : null}
            {columns.map((column, index) => {
              const draft = kindDraft[column.RequirementColumnId] ?? {
                kind: column.Kind,
                choices: "",
              };
              return (
                <div
                  key={column.RequirementColumnId}
                  className="flex flex-col gap-1 rounded-md border border-line p-2"
                  data-testid="register-column"
                >
                  <NameRow
                    label={M.rename(column.Name)}
                    name={column.Name}
                    testId={`register-column-${column.RequirementColumnId}`}
                    pending={pending || !can.update}
                    onSave={(value) =>
                      run(() =>
                        renameRegisterColumnAction({
                          columnId: column.RequirementColumnId,
                          name: value,
                          rowVer: column.RowVer,
                        }),
                      )
                    }
                  >
                    <button
                      type="button"
                      className={buttonClass("ghost", "compact")}
                      aria-label={`${C.moveLeft}: ${column.Name}`}
                      disabled={pending || !can.update || index === 0}
                      onClick={() =>
                        run(() =>
                          moveRegisterColumnAction({
                            columnId: column.RequirementColumnId,
                            direction: -1,
                            rowVer: column.RowVer,
                          }),
                        )
                      }
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className={buttonClass("ghost", "compact")}
                      aria-label={`${C.moveRight}: ${column.Name}`}
                      disabled={pending || !can.update || index === columns.length - 1}
                      onClick={() =>
                        run(() =>
                          moveRegisterColumnAction({
                            columnId: column.RequirementColumnId,
                            direction: 1,
                            rowVer: column.RowVer,
                          }),
                        )
                      }
                    >
                      →
                    </button>
                    {can.delete ? (
                      <button
                        type="button"
                        className={buttonClass("danger", "compact")}
                        aria-label={`${C.deleteColumn}: ${column.Name}`}
                        disabled={pending}
                        data-testid="register-column-delete"
                        onClick={() => setDeleting(column)}
                      >
                        ×
                      </button>
                    ) : null}
                  </NameRow>

                  {column.HasValues ? (
                    <p className="text-xs text-ink-muted">
                      {COLUMN_KIND_SPECS[column.Kind].label}. {M.kindLocked}
                    </p>
                  ) : can.update ? (
                    <div className="flex flex-wrap items-end gap-1">
                      <Select
                        aria-label={`${M.changeKind}: ${column.Name}`}
                        value={draft.kind}
                        data-testid="register-column-kind"
                        onChange={(event) =>
                          setKindDraft({
                            ...kindDraft,
                            [column.RequirementColumnId]: {
                              ...draft,
                              kind: event.target.value as RegisterKind,
                            },
                          })
                        }
                      >
                        {REGISTER_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {COLUMN_KIND_SPECS[kind].label}
                          </option>
                        ))}
                      </Select>
                      {draft.kind === "choice" && column.Kind !== "choice" ? (
                        <Textarea
                          aria-label={M.choices}
                          rows={2}
                          placeholder={M.choicesHint}
                          value={draft.choices}
                          onChange={(event) =>
                            setKindDraft({
                              ...kindDraft,
                              [column.RequirementColumnId]: {
                                ...draft,
                                choices: event.target.value,
                              },
                            })
                          }
                        />
                      ) : null}
                      <button
                        type="button"
                        className={buttonClass("secondary", "compact")}
                        disabled={pending || draft.kind === column.Kind}
                        onClick={() =>
                          run(() =>
                            setRegisterColumnKindAction({
                              columnId: column.RequirementColumnId,
                              kind: draft.kind,
                              choices: draft.kind === "choice" ? lines(draft.choices) : undefined,
                              rowVer: column.RowVer,
                            }),
                          )
                        }
                      >
                        {M.changeKind}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-muted">{COLUMN_KIND_SPECS[column.Kind].label}</p>
                  )}

                  {column.Kind === "choice" ? (
                    <div className="flex flex-col gap-1 pl-2" data-testid="register-choices">
                      {column.Options.map((option) => (
                        <NameRow
                          key={option.id}
                          label={M.renameChoice(option.label)}
                          name={option.label}
                          testId={`register-choice-${option.id}`}
                          pending={pending || !can.update}
                          onSave={(value) =>
                            run(() =>
                              renameChoiceAction({
                                optionId: option.id,
                                label: value,
                                rowVer: option.rowVer,
                              }),
                            )
                          }
                        >
                          {can.delete ? (
                            <button
                              type="button"
                              className={buttonClass("ghost", "compact")}
                              aria-label={M.deleteChoice(option.label)}
                              disabled={pending}
                              onClick={() =>
                                run(() =>
                                  deleteChoiceAction({
                                    optionId: option.id,
                                    rowVer: option.rowVer,
                                  }),
                                )
                              }
                            >
                              ×
                            </button>
                          ) : null}
                        </NameRow>
                      ))}
                      {can.create ? (
                        <form
                          className="flex items-center gap-1"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const label = (choiceDraft[column.RequirementColumnId] ?? "").trim();
                            if (!label) return;
                            run(
                              () =>
                                createChoiceAction({ columnId: column.RequirementColumnId, label }),
                              () =>
                                setChoiceDraft({
                                  ...choiceDraft,
                                  [column.RequirementColumnId]: "",
                                }),
                            );
                          }}
                        >
                          <Input
                            aria-label={M.newChoice(column.Name)}
                            className="min-w-0 flex-1"
                            maxLength={CHOICE_LABEL_MAX}
                            value={choiceDraft[column.RequirementColumnId] ?? ""}
                            data-testid="register-choice-new"
                            onChange={(event) =>
                              setChoiceDraft({
                                ...choiceDraft,
                                [column.RequirementColumnId]: event.target.value,
                              })
                            }
                          />
                          <button
                            type="submit"
                            className={buttonClass("secondary", "compact")}
                            disabled={pending}
                          >
                            {M.addChoice}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>

          {can.create ? (
            columns.length >= MAX_REGISTER_COLUMNS ? (
              <p className="text-sm text-ink-muted">{M.limit(MAX_REGISTER_COLUMNS)}</p>
            ) : (
              <form
                className="flex flex-col gap-2 border-t border-line pt-3"
                data-testid="register-column-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(
                    () =>
                      createRegisterColumnAction({
                        projectId,
                        name: newName,
                        kind: newKind,
                        choices: newKind === "choice" ? lines(newChoices) : undefined,
                      }),
                    () => {
                      setNewName("");
                      setNewChoices("");
                    },
                  );
                }}
              >
                <h3 className="text-sm font-semibold text-ink">{C.addColumnTitle}</h3>
                <Field label={C.columnName} name="name">
                  <Input
                    name="name"
                    value={newName}
                    maxLength={COLUMN_NAME_MAX}
                    required
                    data-testid="register-column-add-name"
                    onChange={(event) => setNewName(event.target.value)}
                  />
                </Field>
                <Field label={C.columnKind} name="kind">
                  <Select
                    name="kind"
                    value={newKind}
                    data-testid="register-column-add-kind"
                    onChange={(event) => setNewKind(event.target.value as RegisterKind)}
                  >
                    {REGISTER_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {COLUMN_KIND_SPECS[kind].label}
                      </option>
                    ))}
                  </Select>
                </Field>
                {newKind === "choice" ? (
                  <Field label={M.choices} name="choices">
                    <Textarea
                      name="choices"
                      rows={3}
                      placeholder={M.choicesHint}
                      value={newChoices}
                      data-testid="register-column-add-choices"
                      onChange={(event) => setNewChoices(event.target.value)}
                    />
                  </Field>
                ) : null}
                <DialogActions>
                  <Button type="submit" pending={pending} data-testid="register-column-add-save">
                    {C.add}
                  </Button>
                </DialogActions>
              </form>
            )
          ) : null}
          <ErrorSummary message={error} />
        </div>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(isOpen) => !isOpen && setDeleting(null)}
        title={C.deleteColumn}
        body={deleting ? M.deletePrompt(deleting.Name) : ""}
        confirmLabel={messages.actions.delete}
        pending={pending}
        onConfirm={() => {
          const column = deleting;
          if (column)
            run(
              () =>
                deleteRegisterColumnAction({
                  columnId: column.RequirementColumnId,
                  rowVer: column.RowVer,
                }),
              () => setDeleting(null),
            );
        }}
      />
    </>
  );
}
