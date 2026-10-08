"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { DatePicker, Input, Select, Switch, Textarea } from "@/components/ui/form/inputs";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { toDateInput } from "@/lib/format";
import { SectionHeading } from "@/components/ui/form/section-heading";
import { createProjectAction, deleteProjectAction, updateProjectAction } from "../actions";
import type { ProjectRow } from "../schemas/project";
import { projectFormSchema, updateProjectFormSchema } from "../schemas/project-form";
import { ListOptions } from "@/components/ui/lookup-lists";

/**
 * The charter workspace form  / ADR-0010 full-route exception):
 * sections Charter, Framework, Financing grouped with plain headings, ONE
 * submit; blur + submit validation against the same zod schema as the server;
 * CONFLICT surfaces an error summary with a reload affordance; unsaved
 * changes guard the navigation away.
 */
export function ProjectForm({
  project,
  canEdit,
  canDelete,
}: {
  project?: ProjectRow;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const schema = project ? updateProjectFormSchema : projectFormSchema;
  const form = useZodForm(schema);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
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
      const result = project
        ? await updateProjectAction(formData)
        : await createProjectAction(formData);
      if (result.ok) {
        toast({
          variant: "success",
          title: project ? messages.feedback.saved : messages.feedback.created,
        });
        announce(project ? messages.feedback.saved : messages.feedback.created);
        if (project) router.refresh();
        else router.push(`/projects/${result.data.ProjectId}`);
      } else {
        form.applyResult(result);
        setSummary(result.error.message);
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });
  };

  const onDelete = () => {
    if (!project) return;
    startTransition(async () => {
      const result = await deleteProjectAction({
        projectId: project.ProjectId,
        rowVer: project.RowVer,
      });
      setConfirmDelete(false);
      if (result.ok) {
        toast({ variant: "success", title: messages.feedback.deleted });
        announce(messages.feedback.deleted);
        router.push("/projects");
      } else {
        setSummary(result.error.message);
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });
  };

  const back = () => {
    router.push("/projects");
  };

  return (
    <form
      ref={formRef}
      noValidate
      onBlur={canEdit ? form.onBlur : undefined}
      onSubmit={onSubmit}
      data-testid="project-form"
      className="flex flex-col gap-6 pb-8"
    >
      <ErrorSummary message={summary} />
      {conflict ? (
        <div>
          <Button type="button" variant="secondary" onClick={() => router.refresh()}>
            {messages.projects.reload}
          </Button>
        </div>
      ) : null}
      {project ? (
        <>
          <input type="hidden" name="projectId" value={project.ProjectId} />
          <input type="hidden" name="rowVer" value={project.RowVer} />
        </>
      ) : null}

      <fieldset disabled={!canEdit} className="flex flex-col gap-6">
        <section
          aria-labelledby="charter-heading"
          className="flex flex-col gap-4  border border-line rounded-md bg-surface [background-image:linear-gradient(to_bottom,var(--surface-raised),var(--surface)_40%)]"
        >
          <SectionHeading id="charter-heading">Project Identity</SectionHeading>
          <div className="px-4 py-3 flex flex-col gap-4">
            <Field
              label={messages.projects.name}
              name="projectName"
              errors={form.errors.projectName}
            >
              <Input name="projectName" defaultValue={project?.ProjectName ?? ""} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={messages.projects.manager}
                name="projectManager"
                errors={form.errors.projectManager}
              >
                <Input name="projectManager" defaultValue={project?.ProjectManager ?? ""} />
              </Field>
              <Field
                label={messages.projects.businessAnalyst}
                name="businessAnalyst"
                errors={form.errors.businessAnalyst}
              >
                <Input name="businessAnalyst" defaultValue={project?.BusinessAnalyst ?? ""} />
              </Field>
              <Field
                label={messages.projects.sponsor}
                name="projectSponsor"
                errors={form.errors.projectSponsor}
              >
                <Input name="projectSponsor" defaultValue={project?.ProjectSponsor ?? ""} />
              </Field>
              <Field
                label={messages.projects.dateOfProject}
                name="dateOfProject"
                errors={form.errors.dateOfProject}
              >
                <DatePicker
                  name="dateOfProject"
                  defaultValue={toDateInput(project?.DateOfProject)}
                />
              </Field>
            </div>
            <Field label={messages.projects.mandate} name="mandate" errors={form.errors.mandate}>
              <Input name="mandate" defaultValue={project?.Mandate ?? ""} />
            </Field>
            <Field
              label={messages.projects.problemStatement}
              name="problemStatement"
              errors={form.errors.problemStatement}
            >
              <Textarea name="problemStatement" defaultValue={project?.ProblemStatement ?? ""} />
            </Field>
            <Field label={messages.projects.currentState} name="currentState">
              <Textarea name="currentState" defaultValue={project?.CurrentState ?? ""} />
            </Field>
            <Field label={messages.projects.futureState} name="futureState">
              <Textarea name="futureState" defaultValue={project?.FutureState ?? ""} />
            </Field>
            <Field label={messages.projects.userImpact} name="userImpact">
              <Textarea name="userImpact" defaultValue={project?.UserImpact ?? ""} />
            </Field>
          </div>
        </section>

        <section
          aria-labelledby="framework-heading"
          className="flex flex-col gap-4  border border-line rounded-md bg-surface [background-image:linear-gradient(to_bottom,var(--surface-raised),var(--surface)_40%)]"
        >
          <SectionHeading id="framework-heading">
            {messages.projects.frameworkSection}
          </SectionHeading>
          <div className="px-4 py-3 flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={messages.projects.status}
                name="projectStatus"
                errors={form.errors.projectStatus}
              >
                <Select name="projectStatus" defaultValue={project?.ProjectStatus ?? ""}>
                  <option value="">{messages.projects.none}</option>
                  <ListOptions list="project.status" current={project?.ProjectStatus} />
                </Select>
              </Field>
              <Field
                label={messages.projects.phase}
                name="projectPhase"
                errors={form.errors.projectPhase}
              >
                <Select name="projectPhase" defaultValue={project?.ProjectPhase ?? ""}>
                  <option value="">{messages.projects.none}</option>
                  <ListOptions list="project.phase" current={project?.ProjectPhase} />
                </Select>
              </Field>
              <Field
                label={messages.projects.priority}
                name="projectPriority"
                errors={form.errors.projectPriority}
              >
                <Select name="projectPriority" defaultValue={project?.ProjectPriority ?? ""}>
                  <option value="">{messages.projects.none}</option>
                  <ListOptions list="project.priority" current={project?.ProjectPriority} />
                </Select>
              </Field>
              <Field
                label={messages.projects.riskLevel}
                name="riskLevel"
                errors={form.errors.riskLevel}
              >
                <Select name="riskLevel" defaultValue={project?.RiskLevel ?? ""}>
                  <option value="">{messages.projects.none}</option>
                  <ListOptions list="project.risk-level" current={project?.RiskLevel} />
                </Select>
              </Field>
              <Field
                label={messages.projects.startDate}
                name="startDate"
                errors={form.errors.startDate}
              >
                <DatePicker name="startDate" defaultValue={toDateInput(project?.StartDate)} />
              </Field>
              <Field label={messages.projects.endDate} name="endDate" errors={form.errors.endDate}>
                <DatePicker name="endDate" defaultValue={toDateInput(project?.EndDate)} />
              </Field>
              <Field
                label={messages.projects.estimatedCompletion}
                name="estimatedCompletionDate"
                errors={form.errors.estimatedCompletionDate}
              >
                <DatePicker
                  name="estimatedCompletionDate"
                  defaultValue={toDateInput(project?.EstimatedCompletionDate)}
                />
              </Field>
              <Field
                label={messages.projects.existingBusinessModel}
                name="existBusMod"
                errors={form.errors.existBusMod}
              >
                <Input name="existBusMod" defaultValue={project?.ExistBusMod ?? ""} />
              </Field>
            </div>
            <Field label={messages.projects.statusComments} name="projectStatusCom">
              <Textarea name="projectStatusCom" defaultValue={project?.ProjectStatusCom ?? ""} />
            </Field>
            <Field label={messages.projects.docs} name="projectDocs">
              <Textarea name="projectDocs" defaultValue={project?.ProjectDocs ?? ""} />
            </Field>
            <Switch
              name="similarProject"
              label={messages.projects.similarProject}
              defaultChecked={project?.SimilarProject ?? false}
            />
          </div>
        </section>

        <section
          aria-labelledby="financing-heading"
          className="flex flex-col gap-4  border border-line rounded-md bg-surface [background-image:linear-gradient(to_bottom,var(--surface-raised),var(--surface)_40%)]"
        >
          <SectionHeading id="financing-heading">
            {messages.projects.financingSection}
          </SectionHeading>
          <div className="px-4 py-3 flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Switch name="do" label={messages.projects.flagDo} defaultChecked={project?.DO} />
              <Switch name="da" label={messages.projects.flagDa} defaultChecked={project?.DA} />
              <Switch name="das" label={messages.projects.flagDas} defaultChecked={project?.DAS} />
              <Switch name="a1" label={messages.projects.flagA1} defaultChecked={project?.A1} />
              <Switch
                name="purchaseOrder"
                label={messages.projects.flagPurchaseOrder}
                defaultChecked={project?.PurchaseOrder}
              />
              <Switch
                name="requisition"
                label={messages.projects.flagRequisition}
                defaultChecked={project?.Requisition}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={messages.projects.financingSource}
                name="financingSource"
                errors={form.errors.financingSource}
              >
                <Input name="financingSource" defaultValue={project?.FinancingSource ?? ""} />
              </Field>
              <Field
                label={messages.projects.financingCost}
                name="financingCost"
                errors={form.errors.financingCost}
              >
                <Input
                  name="financingCost"
                  inputMode="decimal"
                  defaultValue={project?.FinancingCost ?? ""}
                />
              </Field>
              <Field
                label={messages.projects.recurrentCost}
                name="recurrentCost"
                errors={form.errors.recurrentCost}
              >
                <Input
                  name="recurrentCost"
                  inputMode="decimal"
                  defaultValue={project?.RecurrentCost ?? ""}
                />
              </Field>
            </div>
            <Switch
              name="purchaseEquipment"
              label={messages.projects.purchaseEquipment}
              defaultChecked={project?.PurchaseEquipment}
            />
            <Field label={messages.projects.equipmentNotes} name="equipmentNotes">
              <Textarea name="equipmentNotes" defaultValue={project?.EquipmentNotes ?? ""} />
            </Field>
          </div>
        </section>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <Button type="submit" pending={pending} data-testid="project-save">
            {messages.actions.save}
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={back}>
          {messages.actions.cancel}
        </Button>
        {project && canDelete ? (
          <Button
            type="button"
            variant="danger"
            data-testid="project-delete"
            onClick={() => setConfirmDelete(true)}
          >
            {messages.actions.delete}
          </Button>
        ) : null}
      </div>

      {project ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={messages.confirmDelete.title(messages.projects.entity, project.ProjectName)}
          body={messages.confirmDelete.body}
          confirmLabel={messages.actions.delete}
          onConfirm={onDelete}
          pending={pending}
        />
      ) : null}
    </form>
  );
}
