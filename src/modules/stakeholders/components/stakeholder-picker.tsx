"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { failureMessage } from "@/components/ui/data-view/datasheet";
import { IconButton } from "@/components/ui/data-view/datasheet-cells";
import { Combobox, type ComboboxOption } from "@/components/ui/form/combobox";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { createStakeholderAction } from "../actions";
import { stakeholderOption, typedNameValues } from "../names";
import type { StakeholderOption } from "../repository/stakeholder-options";
import { namesAPick, unpickedOptions, type PickedStakeholder } from "../stakeholder-picks";

/**
 * The shared stakeholder picker (ADR-0001: key deliverables use it), laid out like the project
 * team on the Overview: the people picked so far as a short list, each with its ×, and one
 * searchable box under it that adds whoever is chosen and empties for the next. Each row submits
 * a hidden `inputName` entry. A typed name that is not a stakeholder says so and links to the
 * project's stakeholders; with `canAdd` it can also be added as a new stakeholder there and then,
 * and is picked at once.
 */
export function StakeholderMultiSelect({
  projectId,
  canAdd,
  options,
  selected,
  disabled,
  inputName,
  removeLabel,
  emptyPlaceholder,
  autoFocus,
  onAdd,
  onRemove,
}: {
  projectId: number;
  /** The viewer may create stakeholders (stakeholders:create); the action checks it again. */
  canAdd: boolean;
  options: StakeholderOption[];
  selected: readonly PickedStakeholder[];
  disabled: boolean;
  inputName: string;
  removeLabel: (name: string) => string;
  /** Shown when nobody is picked and nobody can be: read-only, or a project with no stakeholders. */
  emptyPlaceholder: string;
  autoFocus?: boolean;
  onAdd: (opt: StakeholderOption) => void;
  onRemove: (id: number) => void;
}) {
  const choices = useMemo<ComboboxOption[]>(
    () =>
      unpickedOptions(options, selected).map((o) => ({
        value: String(o.stakeholderId),
        label: o.name,
      })),
    [options, selected],
  );
  const byValue = useMemo(
    () => new Map(options.map((o) => [String(o.stakeholderId), o])),
    [options],
  );
  const add = useCallback(
    (choice: ComboboxOption) => {
      const option = byValue.get(choice.value);
      if (option) onAdd(option);
    },
    [byValue, onAdd],
  );
  const router = useRouter();
  const { toast } = useToast();
  const [adding, startAdding] = useTransition();
  const addTyped = useCallback(
    (text: string, clear: () => void) =>
      startAdding(async () => {
        const result = await createStakeholderAction(typedNameValues(projectId, text));
        if (!result.ok) {
          toast({ variant: "error", title: failureMessage(result.error) });
          return;
        }
        const option = stakeholderOption(result.data);
        onAdd(option);
        clear();
        toast({ variant: "success", title: messages.stakeholders.stakeholderAdded(option.name) });
        router.refresh();
      }),
    [projectId, onAdd, toast, router],
  );
  const noMatch = useCallback(
    (text: string, clear: () => void) =>
      namesAPick(selected, text) ? null : (
        <div data-testid="stakeholder-no-match" className="flex flex-wrap items-center gap-x-3">
          <span>
            {messages.stakeholders.notAStakeholder(text)}
            {canAdd ? null : ` ${messages.stakeholders.addStakeholderFirst}`}
          </span>
          {canAdd ? (
            <Button
              type="button"
              variant="secondary"
              size="compact"
              className="min-h-11"
              pending={adding}
              onClick={() => addTyped(text, clear)}
            >
              {messages.stakeholders.addAsStakeholder(text)}
            </Button>
          ) : null}
          <Link
            href={`/projects/${projectId}/stakeholders`}
            className="inline-flex min-h-11 items-center font-medium text-accent"
          >
            {messages.stakeholders.viewStakeholders}
          </Link>
        </div>
      ),
    [projectId, canAdd, adding, addTyped, selected],
  );
  return (
    <div data-testid="stakeholder-picks" className="flex flex-col gap-1.5">
      {selected.length > 0 ? (
        <ul className="m-0 list-none divide-y divide-line rounded-md border border-line bg-surface p-0">
          {selected.map((s) => (
            <li key={s.id} className="flex min-h-10 items-center gap-2 pl-3 text-sm text-ink">
              <input type="hidden" name={inputName} value={s.id} />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {disabled ? null : (
                <IconButton label={removeLabel(s.name)} onClick={() => onRemove(s.id)}>
                  <path d="M4 4l8 8M12 4l-8 8" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      ) : disabled ? (
        <p className="m-0 text-sm text-ink-muted">{emptyPlaceholder}</p>
      ) : null}
      {disabled ? null : (
        <Combobox
          options={choices}
          placeholder={
            options.length === 0
              ? emptyPlaceholder
              : messages.stakeholders.addStakeholderPlaceholder
          }
          autoFocus={autoFocus}
          noMatch={noMatch}
          onPick={add}
        />
      )}
    </div>
  );
}

/**
 * The single-choice stakeholder picker (a meeting action's person
 * responsible): the shared Combobox over the given stakeholders. The picked
 * id submits under `name`; clearing the text submits "" (nobody).
 */
export function StakeholderSelect({
  name,
  options,
  defaultValue,
  onSelect,
  freeTextName,
  defaultFreeText,
}: {
  name: string;
  options: StakeholderOption[];
  defaultValue: number | null;
  onSelect?: (option: ComboboxOption | null) => void;
  /** Submit a name that matches no stakeholder under this field (see Combobox). */
  freeTextName?: string;
  defaultFreeText?: string;
}) {
  const choices = useMemo(
    () => options.map((o) => ({ value: String(o.stakeholderId), label: o.name })),
    [options],
  );
  return (
    <Combobox
      name={name}
      options={choices}
      defaultValue={defaultValue == null ? "" : String(defaultValue)}
      onSelect={onSelect}
      freeTextName={freeTextName}
      defaultFreeText={defaultFreeText}
    />
  );
}
