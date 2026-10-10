"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Select, Textarea } from "@/components/ui/form/inputs";
import { SectionHeading } from "@/components/ui/form/section-heading";
import { useUnsavedChangesGuard } from "@/components/ui/form/use-unsaved-changes-guard";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import {
  createStakeholderAction,
  deleteStakeholderAction,
  updateStakeholderAction,
} from "../actions";
import type { StakeholderRow } from "../schemas/stakeholder";
import { stakeholderFormSchema, updateStakeholderFormSchema } from "../schemas/stakeholder-form";
import { fullName } from "./stakeholders-view";
import { ListOptions } from "@/components/ui/lookup-lists";

/**
 * Stakeholder detail/edit sheet (default pattern): edit is the
 * default content, URL-synced via ?id= (numeric id or "new"); closing clears
 * the param and returns focus to the opener row. Project scope comes from the
 * route — projectId travels as a hidden field.
 *
 * Dirty-form guard: closing the sheet while edits are pending shows an
 * unsaved-changes confirmation before discarding (PR-003 fix).
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
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const pendingNavRef = useRef<(() => void) | null>(null);
  useUnsavedChangesGuard(isDirty);

  // Intercept same-document navigations (e.g. browser Back) when form is dirty (C11-7).
  useEffect(() => {
    function handleBeforeNavigate(e: Event) {
      if (!isDirty) return;
      e.preventDefault();
      const resume = (e as CustomEvent<{ resume: () => void }>).detail.resume;
      pendingNavRef.current = resume;
      setShowUnsaved(true);
    }
    window.addEventListener("before-navigate", handleBeforeNavigate);
    return () => window.removeEventListener("before-navigate", handleBeforeNavigate);
  }, [isDirty]);

  const close = () => {
    setIsDirty(false);
    setShowUnsaved(false);
    update({ id: null });
  };

  const discardAndNavigate = () => {
    const resume = pendingNavRef.current;
    pendingNavRef.current = null;
    close();
    resume?.();
  };

  const requestClose = () => {
    if (isDirty) {
      setShowUnsaved(true);
    } else {
      close();
    }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    if (!form.validate(formEl)) {
      setSummary(messages.errors.summaryTitle);
      return;
    }
    setSummary(null);
    setConflict(false);
    const data = new FormData(formEl);
    startTransition(async () => {
      const result = stakeholder
        ? await updateStakeholderAction(data)
        : await createStakeholderAction(data);
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

  const open = isNew || stakeholder !== null;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
        title={stakeholder ? fullName(stakeholder) : messages.stakeholders.newStakeholder}
      >
        <form
          noValidate
          onBlur={canEdit ? form.onBlur : undefined}
          onSubmit={onSubmit}
          data-testid="stakeholder-form"
          className="flex flex-col gap-5"
          onChange={() => setIsDirty(true)}
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

          <fieldset
            disabled={!canEdit}
            className="flex flex-col gap-5"
            onChange={() => setIsDirty(true)}
          >
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
                <Field
                  label={messages.stakeholders.lastName}
                  name="lastName"
                  errors={form.errors.lastName}
                >
                  <Input name="lastName" defaultValue={stakeholder?.LastName ?? ""} />
                </Field>
              </div>
              <Field
                label={messages.stakeholders.departmentOrganization}
                name="departmentOrganization"
                errors={form.errors.departmentOrganization}
              >
                <Input
                  name="departmentOrganization"
                  defaultValue={stakeholder?.DepartmentOrganization ?? ""}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label={messages.stakeholders.projectRole}
                  name="projectRole"
                  errors={form.errors.projectRole}
                >
                  <Input name="projectRole" defaultValue={stakeholder?.ProjectRole ?? ""} />
                </Field>
                <Field
                  label={messages.stakeholders.orgTitle}
                  name="orgTitle"
                  errors={form.errors.orgTitle}
                >
                  <Input name="orgTitle" defaultValue={stakeholder?.OrgTitle ?? ""} />
                </Field>
              </div>
              <Field
                label={messages.stakeholders.roleDescription}
                name="roleDescription"
                errors={form.errors.roleDescription}
              >
                <Input name="roleDescription" defaultValue={stakeholder?.RoleDescription ?? ""} />
              </Field>
            </section>

            <section aria-labelledby="stakeholder-contact-heading" className="flex flex-col gap-4">
              <SectionHeading id="stakeholder-contact-heading">
                {messages.stakeholders.contactSection}
              </SectionHeading>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label={messages.stakeholders.phoneNumber}
                  name="phoneNumber"
                  errors={form.errors.phoneNumber}
                >
                  <Input name="phoneNumber" defaultValue={stakeholder?.PhoneNumber ?? ""} />
                </Field>
                <Field
                  label={messages.stakeholders.phoneExt}
                  name="phoneExt"
                  errors={form.errors.phoneExt}
                >
                  <Input name="phoneExt" defaultValue={stakeholder?.PhoneExt ?? ""} />
                </Field>
                <Field
                  label={messages.stakeholders.mobile}
                  name="mobile"
                  errors={form.errors.mobile}
                >
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
              <Field
                label={messages.stakeholders.physicalLocation}
                name="physicalLocation"
                errors={form.errors.physicalLocation}
              >
                <Input name="physicalLocation" defaultValue={stakeholder?.PhysicalLocation ?? ""} />
              </Field>
            </section>

            <section
              aria-labelledby="stakeholder-engagement-heading"
              className="flex flex-col gap-4"
            >
              <SectionHeading id="stakeholder-engagement-heading">
                {messages.stakeholders.engagementSection}
              </SectionHeading>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label={messages.stakeholders.communicationPreference}
                  name="communicationPreference"
                  errors={form.errors.communicationPreference}
                >
                  <Select
                    name="communicationPreference"
                    defaultValue={stakeholder?.CommunicationPreference ?? ""}
                  >
                    <option value="">{messages.stakeholders.none}</option>
                    <ListOptions
                      list="stakeholder.communication-preference"
                      current={stakeholder?.CommunicationPreference}
                    />
                  </Select>
                </Field>
                <Field
                  label={messages.stakeholders.engagementLevel}
                  name="engagementLevel"
                  errors={form.errors.engagementLevel}
                >
                  <Select name="engagementLevel" defaultValue={stakeholder?.EngagementLevel ?? ""}>
                    <option value="">{messages.stakeholders.none}</option>
                    <ListOptions
                      list="stakeholder.engagement-level"
                      current={stakeholder?.EngagementLevel}
                    />
                  </Select>
                </Field>
              </div>
              <Field
                label={messages.stakeholders.additionalNotes}
                name="additionalNotes"
                errors={form.errors.additionalNotes}
              >
                <Textarea
                  name="additionalNotes"
                  defaultValue={stakeholder?.AdditionalNotes ?? ""}
                />
              </Field>
            </section>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2 px-4 py-2">
            {canEdit ? (
              <Button type="submit" pending={pending} data-testid="stakeholder-save">
                {messages.actions.save}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={requestClose}>
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
            title={messages.confirmDelete.title(
              messages.stakeholders.entity,
              fullName(stakeholder),
            )}
            body={messages.confirmDelete.body}
            confirmLabel={messages.actions.delete}
            onConfirm={onDelete}
            pending={pending}
          />
        ) : null}
      </Sheet>
      <ConfirmDialog
        open={showUnsaved}
        onOpenChange={setShowUnsaved}
        title={messages.feedback.unsavedChangesTitle}
        body={messages.feedback.unsavedChangesBody}
        confirmLabel={messages.feedback.discard}
        onConfirm={discardAndNavigate}
        pending={false}
      />
    </>
  );
}
