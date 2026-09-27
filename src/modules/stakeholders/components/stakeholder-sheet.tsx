"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Select, Textarea } from "@/components/ui/form/inputs";
import { SectionHeading } from "@/components/ui/form/section-heading";
import { useSheetFormActions } from "@/components/ui/form/use-sheet-form-actions";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { messages } from "@/lib/messages";
import { createStakeholderAction, deleteStakeholderAction, updateStakeholderAction } from "../actions";
import {
  COMMUNICATION_PREFERENCES,
  ENGAGEMENT_LEVELS,
  type StakeholderRow,
} from "../schemas/stakeholder";
import { stakeholderFormSchema, updateStakeholderFormSchema } from "../schemas/stakeholder-form";
import { fullName } from "./stakeholders-view";

/**
 * Stakeholder detail/edit sheet  default pattern): edit is the
 * default content, URL-synced via ?id= (numeric id or "new"); closing clears
 * the param and returns focus to the opener row. Project scope comes from the
 * route  — projectId travels as a hidden field.
 */
export function StakeholderSheet({
  stakeholder,
  isNew,
  projectId,
  canEdit,
  canDelete,
}: {
  stakeholder: StakeholderRow | null;
  isNew: boolean;
  projectId: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const { update } = useListUrlState();
  const schema = stakeholder ? updateStakeholderFormSchema : stakeholderFormSchema;
  const form = useZodForm(schema);

  const close = () => update({ id: null });

  const { pending, summary, conflict, confirmDelete, setConfirmDelete, onSubmit, onDelete } =
    useSheetFormActions({
      isEdit: stakeholder !== null,
      onSuccess: close,
      form,
      createAction: createStakeholderAction,
      updateAction: updateStakeholderAction,
      deleteAction: ({
        stakeholderId,
        rowVer,
      }: {
        stakeholderId: number;
        rowVer: number;
      }) => deleteStakeholderAction({ stakeholderId, rowVer }),
    });

  const open = isNew || stakeholder !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={stakeholder ? fullName(stakeholder) : messages.stakeholders.newStakeholder}
    >
      <form
        noValidate
        onBlur={canEdit ? form.onBlur : undefined}
        onSubmit={onSubmit}
        data-testid="stakeholder-form"
        className="flex flex-col gap-5"
      >
        <ErrorSummary message={summary} />
        {conflict ? (
          <div>
            <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
              {messages.stakeholders.reload}
            </Button>
          </div>
        ) : null}
        {/* Project scope always comes from the route */}
        <input type="hidden" name="projectId" value={stakeholder?.ProjectId ?? projectId} />
        {stakeholder ? (
          <>
            <input type="hidden" name="stakeholderId" value={stakeholder.StakeholderId} />
            <input type="hidden" name="rowVer" value={stakeholder.RowVer} />
          </>
        ) : null}

        <fieldset disabled={!canEdit} className="flex flex-col gap-5">
          <section aria-labelledby="stakeholder-details-heading" className="flex flex-col gap-4">
            <SectionHeading id="stakeholder-details-heading">
              {messages.stakeholders.detailsSection}
            </SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={messages.stakeholders.firstName}
                name="firstName"
                errors={form.errors.firstName}
              >
                <Input name="firstName" defaultValue={stakeholder?.FirstName ?? ""} />
              </Field>
              <Field label={messages.stakeholders.lastName} name="lastName">
                <Input name="lastName" defaultValue={stakeholder?.LastName ?? ""} />
              </Field>
            </div>
            <Field
              label={messages.stakeholders.departmentOrganization}
              name="departmentOrganization"
            >
              <Input
                name="departmentOrganization"
                defaultValue={stakeholder?.DepartmentOrganization ?? ""}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={messages.stakeholders.projectRole} name="projectRole">
                <Input name="projectRole" defaultValue={stakeholder?.ProjectRole ?? ""} />
              </Field>
              <Field label={messages.stakeholders.orgTitle} name="orgTitle">
                <Input name="orgTitle" defaultValue={stakeholder?.OrgTitle ?? ""} />
              </Field>
            </div>
            <Field label={messages.stakeholders.roleDescription} name="roleDescription">
              <Input name="roleDescription" defaultValue={stakeholder?.RoleDescription ?? ""} />
            </Field>
          </section>

          <section aria-labelledby="stakeholder-contact-heading" className="flex flex-col gap-4">
            <SectionHeading id="stakeholder-contact-heading">
              {messages.stakeholders.contactSection}
            </SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={messages.stakeholders.phoneNumber} name="phoneNumber">
                <Input name="phoneNumber" defaultValue={stakeholder?.PhoneNumber ?? ""} />
              </Field>
              <Field label={messages.stakeholders.phoneExt} name="phoneExt">
                <Input name="phoneExt" defaultValue={stakeholder?.PhoneExt ?? ""} />
              </Field>
              <Field label={messages.stakeholders.mobile} name="mobile">
                <Input name="mobile" defaultValue={stakeholder?.Mobile ?? ""} />
              </Field>
              <Field
                label={messages.stakeholders.emailAddress}
                name="emailAddress"
                errors={form.errors.emailAddress}
              >
                <Input
                  name="emailAddress"
                  inputMode="email"
                  defaultValue={stakeholder?.EmailAddress ?? ""}
                />
              </Field>
            </div>
            <Field label={messages.stakeholders.physicalLocation} name="physicalLocation">
              <Input name="physicalLocation" defaultValue={stakeholder?.PhysicalLocation ?? ""} />
            </Field>
          </section>

          <section aria-labelledby="stakeholder-engagement-heading" className="flex flex-col gap-4">
            <SectionHeading id="stakeholder-engagement-heading">
              {messages.stakeholders.engagementSection}
            </SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={messages.stakeholders.communicationPreference}
                name="communicationPreference"
              >
                <Select
                  name="communicationPreference"
                  defaultValue={stakeholder?.CommunicationPreference ?? ""}
                >
                  <option value="">{messages.stakeholders.none}</option>
                  {COMMUNICATION_PREFERENCES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={messages.stakeholders.engagementLevel} name="engagementLevel">
                <Select name="engagementLevel" defaultValue={stakeholder?.EngagementLevel ?? ""}>
                  <option value="">{messages.stakeholders.none}</option>
                  {ENGAGEMENT_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={messages.stakeholders.additionalNotes} name="additionalNotes">
              <Textarea name="additionalNotes" defaultValue={stakeholder?.AdditionalNotes ?? ""} />
            </Field>
          </section>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          {canEdit ? (
            <Button type="submit" pending={pending} data-testid="stakeholder-save">
              {messages.actions.save}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={close}>
            {messages.actions.cancel}
          </Button>
          {stakeholder && canDelete ? (
            <Button
              type="button"
              variant="danger"
              data-testid="stakeholder-delete"
              onClick={() => setConfirmDelete(true)}
            >
              {messages.actions.delete}
            </Button>
          ) : null}
        </div>
      </form>

      {stakeholder ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={messages.confirmDelete.title(messages.stakeholders.entity, fullName(stakeholder))}
          body={messages.confirmDelete.body}
          confirmLabel={messages.actions.delete}
          onConfirm={() =>
            stakeholder &&
            onDelete({
              stakeholderId: stakeholder.StakeholderId,
              rowVer: stakeholder.RowVer,
            })
          }
          pending={pending}
        />
      ) : null}
    </Sheet>
  );
}
