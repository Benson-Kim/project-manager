"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Select, Switch, Textarea } from "@/components/ui/form/inputs";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/form/multi-select";
import { useSheetFormActions } from "@/components/ui/form/use-sheet-form-actions";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { messages } from "@/lib/messages";
import {
  createRequirementAction,
  deleteRequirementAction,
  updateRequirementAction,
} from "../actions";
import type { RequirementOption, RequirementRow } from "../schemas/requirement";
import {
  createRequirementFormSchema,
  updateRequirementFormSchema,
} from "../schemas/requirement-form";
import { compatibleTypes } from "../schemas/requirement-rules";
import { isSolution, typeLabel, type RequirementType } from "../schemas/requirement-types";
import {
  coverageText,
  deleteBlockedReason,
  deleteConsequence,
  parentText,
  pickedOptions,
  refsText,
  typeBlockedReason,
} from "./register-model";

const M = messages.requirements;

type Picked = Dispatch<SetStateAction<MultiSelectOption[]>>;

/** A need as the link picker shows it: "BR-1.2 The service runs at night". */
function needChoice(option: RequirementOption): MultiSelectOption {
  return { id: option.id, label: `${option.ref} ${option.text}` };
}

const addTo = (set: Picked) => (option: MultiSelectOption) =>
  set((prev) => (prev.some((p) => p.id === option.id) ? prev : [...prev, option]));

const removeFrom = (set: Picked) => (id: number) => set((prev) => prev.filter((p) => p.id !== id));

/**
 * One requirement's form inside the register's sheet. The type decides the rest: only a solution
 * carries a met tick, validates needs and goes to deliverables. Both id lists are sent with their
 * "set" flag, so saving here replaces them; a datasheet cell edit never sends them and leaves them
 * alone. The offered types are the ones the picked links and allocations fit (usp_Requirement_Update
 * refuses the others with a message the action wrapper hides).
 *
 * A sub-requirement's type is its parent's (ADR-0048), so for one of those the select is replaced
 * by the type as text and the parent is named above it. There is no parent picker: re-parenting is
 * a second feature and the client did not ask for it, so parentage is set once, when the row is
 * created, and the tree can never grow a cycle.
 */
export function RequirementForm({
  requirement,
  projectId,
  initialType,
  initialValidates,
  initialParent,
  needOptions,
  deliverableOptions,
  canEdit,
  canDelete,
  onDone,
}: {
  requirement: RequirementRow | null;
  projectId: number;
  /** A new requirement's starting type: the merge link's, else the filtered type. */
  initialType: RequirementType;
  /** A new requirement's starting links: the merge link's selected needs. */
  initialValidates: readonly number[];
  /** The requirement a new one goes under, from ?parent=; null for a root. */
  initialParent: RequirementRow | null;
  needOptions: RequirementOption[];
  deliverableOptions: MultiSelectOption[];
  canEdit: boolean;
  canDelete: boolean;
  onDone: () => void;
}) {
  const schema = requirement ? updateRequirementFormSchema : createRequirementFormSchema;
  const form = useZodForm(schema);

  const needChoices = useMemo(() => needOptions.map(needChoice), [needOptions]);
  const [type, setType] = useState<RequirementType>(requirement?.RequirementType ?? initialType);
  const [validates, setValidates] = useState<MultiSelectOption[]>(() =>
    pickedOptions(
      requirement ? requirement.Validates.map((r) => r.id) : initialValidates,
      needChoices,
    ),
  );
  const [deliverables, setDeliverables] = useState<MultiSelectOption[]>(() =>
    pickedOptions(requirement?.DeliverableIds ?? [], deliverableOptions),
  );

  // What the save will leave behind, so the select offers exactly the types the procs accept.
  const offeredTypes = compatibleTypes({
    type: requirement?.RequirementType ?? type,
    validates: validates.length,
    validatedBy: requirement?.ValidatedBy.length ?? 0,
    allocations: deliverables.length,
  });

  const { pending, summary, conflict, confirmDelete, setConfirmDelete, onSubmit, onDelete } =
    useSheetFormActions({
      isEdit: requirement !== null,
      onSuccess: onDone,
      form,
      createAction: createRequirementAction,
      updateAction: updateRequirementAction,
      deleteAction: () =>
        requirement
          ? deleteRequirementAction({
              requirementId: requirement.RequirementId,
              rowVer: requirement.RowVer,
            })
          : Promise.resolve({
              ok: false as const,
              error: { code: "NOT_FOUND" as const, message: "" },
            }),
    });

  const solution = isSolution(type);

  // A child takes its parent's type and cannot change it: an existing one because Depth says so,
  // a new one because it is being created under initialParent. Either way the type travels as a
  // hidden field so the schema still sees it, and usp_Requirement_Create re-reads it from the
  // parent regardless, so the two cannot disagree.
  const typeBlocked = requirement ? typeBlockedReason(requirement) : null;
  const inheritsType = initialParent !== null || (requirement?.Depth ?? 0) > 0;
  const parentLine = requirement ? parentText(requirement) : null;
  const deleteBlocked = requirement ? deleteBlockedReason(requirement) : null;

  return (
    <form
      noValidate
      onBlur={canEdit ? form.onBlur : undefined}
      onSubmit={onSubmit}
      data-testid="requirement-form"
      className="flex flex-col gap-5"
    >
      <ErrorSummary message={summary} />
      {conflict ? (
        <div>
          <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
            {M.reload}
          </Button>
        </div>
      ) : null}
      <input type="hidden" name="projectId" value={requirement?.ProjectId ?? projectId} />
      {initialParent ? (
        <input type="hidden" name="parentRequirementId" value={initialParent.RequirementId} />
      ) : null}
      <input type="hidden" name="validatesSet" value="1" />
      <input type="hidden" name="deliverablesSet" value="1" />
      {requirement ? (
        <>
          <input type="hidden" name="requirementId" value={requirement.RequirementId} />
          <input type="hidden" name="rowVer" value={requirement.RowVer} />
        </>
      ) : null}

      <fieldset disabled={!canEdit} className="flex flex-col gap-5">
        {initialParent ? (
          <p className="text-sm text-ink-muted" data-testid="requirement-parent">
            {M.subRequirementOf(initialParent.Ref)}
          </p>
        ) : null}
        {parentLine ? (
          <p className="text-sm text-ink-muted" data-testid="requirement-parent">
            {parentLine}
          </p>
        ) : null}

        <Field label={M.type} name="requirementType" errors={form.errors.requirementType}>
          {inheritsType || typeBlocked ? (
            <>
              <input type="hidden" name="requirementType" value={type} />
              <p className="text-sm text-ink" data-testid="requirement-type-fixed">
                {M.typeWithCode(typeLabel(type), type)}
              </p>
              <p className="text-sm text-ink-muted">{typeBlocked ?? M.typeIsParents}</p>
            </>
          ) : (
            <Select
              name="requirementType"
              value={type}
              onChange={(e) => setType(e.target.value as RequirementType)}
            >
              {offeredTypes.map((option) => (
                <option key={option} value={option}>
                  {M.typeWithCode(typeLabel(option), option)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={M.requirement} name="requirement" errors={form.errors.requirement}>
          <Textarea name="requirement" rows={4} defaultValue={requirement?.Requirement ?? ""} />
        </Field>

        {solution ? (
          <>
            <Switch name="isMet" label={M.met} defaultChecked={requirement?.IsMet ?? false} />
            <Field label={M.validates} name="validatesIds[]">
              <MultiSelect
                options={needChoices}
                selected={validates}
                disabled={!canEdit}
                inputName="validatesIds[]"
                removeLabel={M.removeChip}
                emptyPlaceholder={M.noNeeds}
                onAdd={addTo(setValidates)}
                onRemove={removeFrom(setValidates)}
              />
            </Field>
            <Field label={M.deliverables} name="deliverableIds[]">
              <MultiSelect
                options={deliverableOptions}
                selected={deliverables}
                disabled={!canEdit}
                inputName="deliverableIds[]"
                removeLabel={M.removeChip}
                emptyPlaceholder={M.noDeliverables}
                onAdd={addTo(setDeliverables)}
                onRemove={removeFrom(setDeliverables)}
              />
            </Field>
          </>
        ) : null}
      </fieldset>

      {requirement && !solution ? (
        <dl className="flex flex-col gap-1">
          <dt className="text-sm text-ink leading-6">{M.validatedBy}</dt>
          <dd className="text-sm text-ink-muted" data-testid="requirement-validated-by">
            {refsText(requirement.ValidatedBy)}
          </dd>
          <dt className="text-sm text-ink leading-6">{M.coverage}</dt>
          <dd className="text-sm text-ink-muted" data-testid="requirement-coverage">
            {coverageText(requirement)}
          </dd>
        </dl>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        {canEdit ? (
          <Button type="submit" pending={pending} data-testid="requirement-save">
            {messages.actions.save}
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={onDone}>
          {messages.actions.cancel}
        </Button>
        {requirement && canDelete && deleteBlocked === null ? (
          <Button
            type="button"
            variant="danger"
            data-testid="requirement-delete"
            onClick={() => setConfirmDelete(true)}
          >
            {messages.actions.delete}
          </Button>
        ) : null}
        {requirement && canDelete && deleteBlocked !== null ? (
          <p className="text-sm text-ink-muted" data-testid="requirement-delete-blocked">
            {deleteBlocked}
          </p>
        ) : null}
      </div>

      {requirement ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={M.deleteTitle(requirement.Ref)}
          body={deleteConsequence(requirement)}
          confirmLabel={messages.actions.delete}
          onConfirm={onDelete}
          pending={pending}
        />
      ) : null}
    </form>
  );
}
