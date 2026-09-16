"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Select, Textarea } from "@/components/ui/form/inputs";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { createStakeholderAction } from "../actions/create-stakeholder";
import { deleteStakeholderAction } from "../actions/delete-stakeholder";
import { updateStakeholderAction } from "../actions/update-stakeholder";
import {
  COMMUNICATION_PREFERENCES,
  ENGAGEMENT_LEVELS,
  type StakeholderRow,
} from "../schemas/stakeholder";
import { stakeholderFormSchema, updateStakeholderFormSchema } from "../schemas/stakeholder-form";
import { fullName } from "./stakeholders-view";

export interface ProjectOption {
  ProjectId: number;
  ProjectName: string;
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="border-b border-line pb-2 text-sm font-semibold text-ink">
      {children}
    </h2>
  );
}

/**
 * Stakeholder detail/edit sheet (ADR-0010 default pattern): edit is the
 * default content, URL-synced via ?id= (numeric id or "new"); closing clears
 * the param and returns focus to the opener row.
 */
export function StakeholderSheet({
  stakeholder,
  isNew,
  projects,
  defaultProjectId,
  canEdit,
  canDelete,
}: {
  stakeholder: StakeholderRow | null;
  isNew: boolean;
  projects: ProjectOption[];
  defaultProjectId?: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { update } = useListUrlState();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const schema = stakeholder ? updateStakeholderFormSchema : stakeholderFormSchema;
  const form = useZodForm(schema);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const open = isNew || stakeholder !== null;
  const close = () => update({ id: null });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!form.validate(formElement)) {
      setSummary(messages.errors.VALIDATION);
      return;
    }
    setSummary(null);
    setConflict(false);
    const formData = new FormData(formElement);
    startTransition(async () => {
      const result = stakeholder
        ? await updateStakeholderAction(formData)
        : await createStakeholderAction(formData);
      if (result.ok) {
        toast({
          variant: "success",
          title: stakeholder ? messages.feedback.saved : messages.feedback.created,
        });
        announce(stakeholder ? messages.feedback.saved : messages.feedback.created);
        close();
        router.refresh();
      } else {
        form.applyResult(result);
        setSummary(result.error.message);
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });
  };

  const onDelete = () => {
    if (!stakeholder) return;
    startTransition(async () => {
      const result = await deleteStakeholderAction({
        stakeholderId: stakeholder.StakeholderId,
        rowVer: stakeholder.RowVer,
      });
      setConfirmDelete(false);
      if (result.ok) {
        toast({ variant: "success", title: messages.feedback.deleted });
        announce(messages.feedback.deleted);
        close();
        router.refresh();
      } else {
        setSummary(result.error.message);
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });
  };

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
            <Button type="button" variant="secondary" onClick={() => router.refresh()}>
              {messages.stakeholders.reload}
            </Button>
          </div>
        ) : null}
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
            <Field
              label={messages.stakeholders.project}
              name="projectId"
              errors={form.errors.projectId}
            >
              <Select
                name="projectId"
                defaultValue={stakeholder?.ProjectId ?? defaultProjectId ?? ""}
              >
                <option value="">{messages.stakeholders.none}</option>
                {projects.map((p) => (
                  <option key={p.ProjectId} value={p.ProjectId}>
                    {p.ProjectName}
                  </option>
                ))}
              </Select>
            </Field>
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

        <div className="flex flex-wrap items-center gap-2 pb-2">
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
          onConfirm={onDelete}
          pending={pending}
        />
      ) : null}
    </Sheet>
  );
}
