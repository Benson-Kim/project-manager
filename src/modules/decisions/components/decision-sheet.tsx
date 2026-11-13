"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Sheet } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Select } from "@/components/ui/form/inputs";
import { LabelMultiSelect } from "@/components/ui/form/label-multi-select";
import { ListSelect } from "@/components/ui/form/list-select";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/form/multi-select";
import { useSheetFormActions } from "@/components/ui/form/use-sheet-form-actions";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { RichTextEditor } from "@/components/ui/rich-text/rich-text-editor";
import { toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import type { StakeholderOption } from "@/modules/stakeholders/repository/stakeholder-options";
import { createDecisionAction, deleteDecisionAction, updateDecisionAction } from "../actions";
import type { DecisionRow } from "../schemas/decision";
import type { DecisionOption } from "../repository/decisions";
import {
  createDecisionFormSchema,
  decisionFormValues,
  updateDecisionFormSchema,
} from "../schemas/decision-form";
import { sheetUndo } from "@/lib/undo/steps";

const M = messages.decisions;

const asOption = (person: StakeholderOption): MultiSelectOption => ({
  id: person.stakeholderId,
  label: person.name,
});

/**
 * Decision detail/edit sheet (ADR-0010 default pattern): URL-synced via ?id=
 * (a numeric id or "new"); closing clears the param.
 *
 * Both sets send their own hidden "set" flag, so saving here replaces the
 * impacted areas and the consulted people, while a datasheet cell edit, which
 * sends neither, leaves them as they stand (ADR-0055). The number is assigned
 * by usp_Decision_Create under the project lock, so it is shown, never typed.
 */
export function DecisionSheet({
  item,
  isNew,
  projectId,
  people,
  decisionOptions,
  canEdit,
  canDelete,
}: {
  item: DecisionRow | null;
  isNew: boolean;
  projectId: number;
  people: StakeholderOption[];
  /** The project's other decisions, for the supersession picker. */
  decisionOptions: DecisionOption[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const { update, searchParams } = useListUrlState();
  const close = () => update({ id: null, page: searchParams.get("page") ?? null });
  const schema = item ? updateDecisionFormSchema : createDecisionFormSchema;
  const form = useZodForm(schema);

  const peopleOptions = useMemo(() => people.map(asOption), [people]);
  const [consulted, setConsulted] = useState<MultiSelectOption[]>(() =>
    peopleOptions.filter((option) => (item?.ConsultedStakeholderIds ?? []).includes(option.id)),
  );

  const { pending, summary, conflict, confirmDelete, setConfirmDelete, onSubmit, onDelete } =
    useSheetFormActions({
      isEdit: item !== null,
      onSuccess: close,
      form,
      createAction: createDecisionAction,
      updateAction: updateDecisionAction,
      deleteAction: () =>
        item
          ? deleteDecisionAction({ decisionId: item.DecisionId, rowVer: item.RowVer })
          : Promise.resolve({
              ok: false as const,
              error: { code: "NOT_FOUND" as const, message: "" },
            }),
      undo: sheetUndo<DecisionRow>({
        moduleKey: "decisions",
        idOf: (row) => row.DecisionId,
        nameOf: (row) => row.Title,
        before: item,
        toFormValues: decisionFormValues,
        update: updateDecisionAction,
        create: createDecisionAction,
        remove: (row) => deleteDecisionAction({ decisionId: row.DecisionId, rowVer: row.RowVer }),
      }),
    });

  const open = isNew || item !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={item ? M.refWithTitle(item.DecisionNumber, item.Title) : M.newItem}
    >
      <form
        noValidate
        onBlur={canEdit ? form.onBlur : undefined}
        onSubmit={onSubmit}
        data-testid="decision-form"
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

        <input type="hidden" name="projectId" value={item?.ProjectId ?? projectId} />
        <input type="hidden" name="impactedAreasSet" value="1" />
        <input type="hidden" name="stakeholdersSet" value="1" />
        {item ? (
          <>
            <input type="hidden" name="decisionId" value={item.DecisionId} />
            <input type="hidden" name="rowVer" value={item.RowVer} />
          </>
        ) : null}

        <fieldset disabled={!canEdit} className="flex flex-col gap-5">
          <Field label={M.decisionTitle} name="title" errors={form.errors.title}>
            <Input name="title" maxLength={255} defaultValue={item?.Title ?? ""} />
          </Field>

          <Field label={M.status} name="status" errors={form.errors.status}>
            <ListSelect
              list="decision.status"
              current={item?.Status}
              name="status"
              defaultValue={item?.Status ?? ""}
            >
              <option value="">{M.statusNone}</option>
            </ListSelect>
          </Field>

          <Field label={M.dateLogged} name="dateLogged" errors={form.errors.dateLogged}>
            <Input type="date" name="dateLogged" defaultValue={toDateInput(item?.DateLogged)} />
          </Field>

          <Field label={M.owner} name="ownerStakeholderId" errors={form.errors.ownerStakeholderId}>
            <Select
              name="ownerStakeholderId"
              defaultValue={
                item?.OwnerStakeholderId === null ? "" : String(item?.OwnerStakeholderId ?? "")
              }
            >
              <option value="">{M.ownerNone}</option>
              {peopleOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={M.impactedAreas} name="impactedAreas[]">
            <LabelMultiSelect
              list="decision.impacted-area"
              name="impactedAreas[]"
              defaultValue={item?.ImpactedAreas}
              disabled={!canEdit}
              removeLabel={M.removeChip}
              emptyPlaceholder={M.noAreas}
            />
          </Field>

          <Field label={M.consulted} name="consultedStakeholderIds[]">
            <MultiSelect
              options={peopleOptions}
              selected={consulted}
              disabled={!canEdit}
              inputName="consultedStakeholderIds[]"
              removeLabel={M.removeChip}
              emptyPlaceholder={M.noStakeholders}
              onAdd={(option) =>
                setConsulted((prev) =>
                  prev.some((picked) => picked.id === option.id) ? prev : [...prev, option],
                )
              }
              onRemove={(id) => setConsulted((prev) => prev.filter((picked) => picked.id !== id))}
            />
          </Field>

          <Field label={M.problemContext} name="problemContext" errors={form.errors.problemContext}>
            <RichTextEditor name="problemContext" defaultValue={item?.ProblemContext} />
          </Field>

          <Field
            label={M.optionsConsidered}
            name="optionsConsidered"
            errors={form.errors.optionsConsidered}
          >
            <RichTextEditor name="optionsConsidered" defaultValue={item?.OptionsConsidered} />
          </Field>

          <Field label={M.rationale} name="rationale" errors={form.errors.rationale}>
            <RichTextEditor name="rationale" defaultValue={item?.Rationale} />
          </Field>

          <Field label={M.nextSteps} name="nextSteps" errors={form.errors.nextSteps}>
            <RichTextEditor name="nextSteps" defaultValue={item?.NextSteps} />
          </Field>

          <Field
            label={M.supersededBy}
            name="supersededByDecisionId"
            errors={form.errors.supersededByDecisionId}
          >
            <Select
              name="supersededByDecisionId"
              defaultValue={
                item?.SupersededByDecisionId === null
                  ? ""
                  : String(item?.SupersededByDecisionId ?? "")
              }
            >
              <option value="">{M.supersededByNone}</option>
              {decisionOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          {canEdit ? (
            <Button type="submit" pending={pending} data-testid="decision-save">
              {messages.actions.save}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={close}>
            {messages.actions.cancel}
          </Button>
          {item && canDelete ? (
            <Button
              type="button"
              variant="danger"
              data-testid="decision-delete"
              onClick={() => setConfirmDelete(true)}
            >
              {messages.actions.delete}
            </Button>
          ) : null}
        </div>
      </form>

      {item ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={messages.confirmDelete.title(M.entity, M.ref(item.DecisionNumber))}
          body={messages.confirmDelete.body}
          confirmLabel={messages.actions.delete}
          onConfirm={onDelete}
          pending={pending}
        />
      ) : null}
    </Sheet>
  );
}
