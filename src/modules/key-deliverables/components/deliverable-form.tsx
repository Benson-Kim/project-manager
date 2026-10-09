"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field, useFieldContext } from "@/components/ui/form/field";
import { DatePicker, Select, Textarea } from "@/components/ui/form/inputs";
import { useSheetFormActions } from "@/components/ui/form/use-sheet-form-actions";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { ListOptions } from "@/components/ui/lookup-lists";
import { messages } from "@/lib/messages";
import { toDateInput } from "@/lib/format";
import {
  createKeyDeliverableAction,
  deleteKeyDeliverableAction,
  updateKeyDeliverableAction,
} from "../actions";

import type { KeyDeliverableRow } from "../schemas/key-deliverable";
import {
  keyDeliverableFormSchema,
  updateKeyDeliverableFormSchema,
} from "../schemas/key-deliverable-form";
import type { StakeholderOption } from "../repository/stakeholder-options";

/** Chip tag for a selected assignee. */
function AssigneeChip({
  id,
  name,
  disabled,
  onRemove,
}: {
  id: number;
  name: string;
  disabled: boolean;
  onRemove: (id: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-raised px-2.5 py-0.5 text-xs text-ink">
      {/* Hidden input so chip participates in FormData as assigneeIds[] */}
      <input type="hidden" name="assigneeIds[]" value={id} />
      {name}
      {!disabled && (
        <button
          type="button"
          aria-label={messages.keyDeliverables.removeAssignee(name)}
          className="ml-0.5 inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-ink-muted hover:text-danger focus-visible:outline-2 focus-visible:outline-focus"
          onClick={() => onRemove(id)}
        >
          ×
        </button>
      )}
    </span>
  );
}

/**
 * Inline multi-select: type to filter options, click to add chips.
 * Does not use the shared Combobox (single-select only) but follows
 * the same ARIA combobox pattern.
 */
function MultiAssigneeSelect({
  options,
  selected,
  disabled,
  onAdd,
  onRemove,
}: {
  options: StakeholderOption[];
  selected: { id: number; name: string }[];
  disabled: boolean;
  onAdd: (opt: StakeholderOption) => void;
  onRemove: (id: number) => void;
}) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldCtx = useFieldContext();

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) => !selectedIds.has(o.stakeholderId) && (!q || o.name.toLowerCase().includes(q)),
    );
  }, [options, query, selectedIds]);

  const pick = useCallback(
    (opt: StakeholderOption) => {
      onAdd(opt);
      setQuery("");
      setActiveIndex(0);
      inputRef.current?.focus();
    },
    [onAdd],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[activeIndex]) {
        e.preventDefault();
        pick(filtered[activeIndex]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        setOpen(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <AssigneeChip
              key={s.id}
              id={s.id}
              name={s.name}
              disabled={disabled}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
      {!disabled && (
        <div className="relative">
          <input
            ref={inputRef}
            id={fieldCtx?.inputId}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && filtered[activeIndex]
                ? `${listboxId}-${filtered[activeIndex].stakeholderId}`
                : undefined
            }
            aria-invalid={fieldCtx?.invalid || undefined}
            aria-describedby={fieldCtx?.invalid ? fieldCtx.errorId : undefined}
            autoComplete="off"
            placeholder={options.length === 0 ? messages.keyDeliverables.unassigned : ""}
            className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 100)}
            onKeyDown={onKeyDown}
          />
          <ul
            id={listboxId}
            role="listbox"
            hidden={!open || filtered.length === 0}
            className="absolute z-(--z-dialog) mt-1 max-h-60 w-full overflow-auto rounded-md border border-line bg-surface-raised py-1 shadow-lg"
          >
            {filtered.map((opt, idx) => (
              <li
                key={opt.stakeholderId}
                id={`${listboxId}-${opt.stakeholderId}`}
                role="option"
                aria-selected={false}
                className={`flex min-h-11 cursor-pointer items-center px-3 text-sm ${
                  idx === activeIndex ? "bg-accent-soft text-ink" : "text-ink"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(opt);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                {opt.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * ONE deliverable form rendered inside the Sheet: blur + submit
 * validation against the same zod schema as the server; CONFLICT surfaces an
 * error summary with a reload affordance.
 */
export function DeliverableForm({
  projectId,
  deliverable,
  assigneeOptions,
  canEdit,
  canDelete,
  onDone,
}: {
  projectId: number;
  deliverable?: KeyDeliverableRow;
  assigneeOptions: StakeholderOption[];
  canEdit: boolean;
  canDelete: boolean;
  onDone: () => void;
}) {
  const schema = deliverable ? updateKeyDeliverableFormSchema : keyDeliverableFormSchema;
  const form = useZodForm(schema);

  // Multi-assignee state — initialised from the row's Assignees array.
  const [selectedAssignees, setSelectedAssignees] = useState<{ id: number; name: string }[]>(
    () => deliverable?.Assignees ?? [],
  );

  const handleAdd = useCallback((opt: StakeholderOption) => {
    setSelectedAssignees((prev) => {
      if (prev.some((a) => a.id === opt.stakeholderId)) return prev;
      return [...prev, { id: opt.stakeholderId, name: opt.name }];
    });
  }, []);

  const handleRemove = useCallback((id: number) => {
    setSelectedAssignees((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const { pending, summary, conflict, confirmDelete, setConfirmDelete, onSubmit, onDelete } =
    useSheetFormActions({
      isEdit: deliverable !== undefined,
      onSuccess: onDone,
      form,
      createAction: createKeyDeliverableAction,
      updateAction: updateKeyDeliverableAction,
      deleteAction: () =>
        deliverable
          ? deleteKeyDeliverableAction({
              keyDeliverableId: deliverable.KeyDeliverableId,
              rowVer: deliverable.RowVer,
            })
          : Promise.resolve({
              ok: false as const,
              error: { code: "NOT_FOUND" as const, message: "" },
            }),
    });

  return (
    <form
      noValidate
      onBlur={canEdit ? form.onBlur : undefined}
      onSubmit={onSubmit}
      data-testid="deliverable-form"
      className="flex flex-col gap-4"
    >
      <ErrorSummary message={summary} />
      {conflict ? (
        <div>
          <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
            {messages.keyDeliverables.reload}
          </Button>
        </div>
      ) : null}
      <input type="hidden" name="projectId" value={projectId} />
      {deliverable ? (
        <>
          <input type="hidden" name="keyDeliverableId" value={deliverable.KeyDeliverableId} />
          <input type="hidden" name="rowVer" value={deliverable.RowVer} />
        </>
      ) : null}

      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        <Field
          label={messages.keyDeliverables.requirement}
          name="keyRequirement"
          errors={form.errors.keyRequirement}
        >
          <Textarea name="keyRequirement" defaultValue={deliverable?.KeyRequirement ?? ""} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={messages.keyDeliverables.requestedDate}
            name="requestedDate"
            errors={form.errors.requestedDate}
          >
            <DatePicker
              name="requestedDate"
              defaultValue={toDateInput(deliverable?.RequestedDate)}
            />
          </Field>
          <Field
            label={messages.keyDeliverables.deadline}
            name="deadline"
            errors={form.errors.deadline}
          >
            <DatePicker name="deadline" defaultValue={toDateInput(deliverable?.Deadline)} />
          </Field>
          <Field label={messages.keyDeliverables.status} name="status" errors={form.errors.status}>
            <Select name="status" defaultValue={deliverable?.Status ?? ""}>
              <option value="">{messages.projects.none}</option>
              <ListOptions list="key-deliverable.status" current={deliverable?.Status} />
            </Select>
          </Field>
          <Field
            label={messages.keyDeliverables.priority}
            name="priority"
            errors={form.errors.priority}
          >
            <Select name="priority" defaultValue={deliverable?.Priority ?? ""}>
              <option value="">{messages.projects.none}</option>
              <ListOptions list="key-deliverable.priority" current={deliverable?.Priority} />
            </Select>
          </Field>
        </div>

        <Field label={messages.keyDeliverables.assignees} name="assigneeIds[]">
          <MultiAssigneeSelect
            options={assigneeOptions}
            selected={selectedAssignees}
            disabled={!canEdit}
            onAdd={handleAdd}
            onRemove={handleRemove}
          />
        </Field>
      </fieldset>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {canEdit ? (
            <Button type="submit" pending={pending} data-testid="deliverable-save">
              {messages.actions.save}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={onDone}>
            {messages.actions.cancel}
          </Button>
        </div>
        {deliverable && canDelete ? (
          <Button
            type="button"
            variant="danger"
            pending={pending}
            data-testid="deliverable-delete"
            onClick={() => setConfirmDelete(true)}
          >
            {messages.actions.delete}
          </Button>
        ) : null}
      </div>

      {deliverable ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={messages.confirmDelete.title(
            messages.keyDeliverables.entity,
            deliverable.KeyRequirement ??
              messages.keyDeliverables.deliverableFallback(deliverable.KeyDeliverableId),
          )}
          body={messages.confirmDelete.body}
          confirmLabel={messages.actions.delete}
          onConfirm={onDelete}
          pending={pending}
        />
      ) : null}
    </form>
  );
}
