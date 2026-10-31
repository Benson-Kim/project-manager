"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Select } from "@/components/ui/form/inputs";
import { RichTextEditor } from "@/components/ui/rich-text/rich-text-editor";
import { useUnsavedChangesGuard } from "@/components/ui/form/use-unsaved-changes-guard";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { ListOptions } from "@/components/ui/lookup-lists";
import { useToast } from "@/components/ui/toast";
import { toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import { richTextToPlain } from "@/lib/rich-text/plain-text";
import { RISK_ISSUE_CATEGORY, RISK_ISSUE_STATUS, type RiskIssueRow } from "../schemas/risk-issue";
import { riskIssueFormSchema, updateRiskIssueFormSchema } from "../schemas/risk-issue-form";
import { createRiskIssueAction, deleteRiskIssueAction, updateRiskIssueAction } from "../actions";

/** The record's own words, cut to fit a title or a confirmation. */
function label(item: RiskIssueRow | null, max: number): string {
  const text = richTextToPlain(item?.Description) || messages.app.untitled;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Risk/issue detail/edit sheet (ADR-0010 default pattern): URL-synced via ?id=
 * (numeric id or "new"); closing clears the param. Project scope travels as a
 * hidden field, and the stored dates travel with it so an update that leaves
 * them untouched keeps passing the date-order rule (date-range.ts).
 */
export function RiskIssueSheet({
  item,
  isNew,
  projectId,
  canEdit,
  canDelete,
}: {
  item: RiskIssueRow | null;
  isNew: boolean;
  projectId: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { update, searchParams } = useListUrlState();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const schema = item ? updateRiskIssueFormSchema : riskIssueFormSchema;
  const form = useZodForm(schema);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const pendingNavRef = useRef<(() => void) | null>(null);
  const { markClean } = useUnsavedChangesGuard(isDirty);

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
    // Clear the guard ref SYNCHRONOUSLY before update() so the history.replaceState
    // intercept in useUnsavedChangesGuard does not re-open the discard dialog.
    markClean();
    setIsDirty(false);
    setShowUnsaved(false);
    update({ id: null, page: searchParams.get("page") ?? null });
  };

  const discardAndNavigate = () => {
    const resume = pendingNavRef.current;
    pendingNavRef.current = null;
    close();
    resume?.();
  };

  const requestClose = () => {
    if (isDirty) setShowUnsaved(true);
    else close();
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
      const result = item ? await updateRiskIssueAction(data) : await createRiskIssueAction(data);
      if (result.ok) {
        toast({
          variant: "success",
          title: item ? messages.feedback.saved : messages.feedback.created,
        });
        announce(item ? messages.feedback.saved : messages.feedback.created);
        close();
        router.refresh();
      } else {
        form.applyResult(result);
        setSummary(result.error.message);
        if (result.error.code === "CONFLICT") {
          setConflict(true);
          announce(result.error.message);
        }
      }
    });
  };

  const onDelete = () => {
    if (!item) return;
    startTransition(async () => {
      const result = await deleteRiskIssueAction({
        riskIssueId: item.RiskIssueId,
        rowVer: item.RowVer,
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

  const open = isNew || item !== null;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
        title={item ? label(item, 60) : messages.risksIssues.newItem}
      >
        <form
          noValidate
          onBlur={canEdit ? form.onBlur : undefined}
          onSubmit={onSubmit}
          data-testid="risk-issue-form"
          className="flex flex-col gap-5"
        >
          <ErrorSummary message={summary} />
          {conflict ? (
            <div>
              <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
                {messages.risksIssues.reload}
              </Button>
            </div>
          ) : null}

          {/* Hidden fields */}
          <input type="hidden" name="projectId" value={item?.ProjectId ?? projectId} />
          {item ? (
            <>
              <input type="hidden" name="riskIssueId" value={item.RiskIssueId} />
              <input type="hidden" name="rowVer" value={item.RowVer} />
              {/* The stored dates, so an untouched pair keeps passing the order rule. */}
              <input
                type="hidden"
                name="dateIdentifiedWas"
                value={toDateInput(item.DateIdentified)}
              />
              <input type="hidden" name="dueDateWas" value={toDateInput(item.DueDate)} />
            </>
          ) : null}

          <fieldset
            disabled={!canEdit}
            className="flex flex-col gap-5"
            onChange={() => setIsDirty(true)}
          >
            <Field
              label={messages.risksIssues.description}
              name="description"
              errors={form.errors.description}
            >
              <RichTextEditor name="description" defaultValue={item?.Description} />
            </Field>

            <Field
              label={messages.risksIssues.category}
              name="category"
              errors={form.errors.category}
            >
              <Select
                name="category"
                defaultValue={item ? (item.Category ?? "") : RISK_ISSUE_CATEGORY.risk}
              >
                <option value="">{messages.risksIssues.categoryNone}</option>
                <ListOptions list="risk-issue.category" current={item?.Category} />
              </Select>
            </Field>

            <Field label={messages.risksIssues.status} name="status" errors={form.errors.status}>
              <Select
                name="status"
                defaultValue={item ? (item.Status ?? "") : RISK_ISSUE_STATUS.open}
              >
                <option value="">{messages.risksIssues.statusNone}</option>
                <ListOptions list="risk-issue.status" current={item?.Status} />
              </Select>
            </Field>

            <Field
              label={messages.risksIssues.priority}
              name="priority"
              errors={form.errors.priority}
            >
              <Select name="priority" defaultValue={item?.Priority ?? ""}>
                <option value="">{messages.risksIssues.priorityNone}</option>
                <ListOptions list="risk-issue.priority" current={item?.Priority} />
              </Select>
            </Field>

            <Field label={messages.risksIssues.impact} name="impact" errors={form.errors.impact}>
              <Select name="impact" defaultValue={item?.Impact ?? ""}>
                <option value="">{messages.risksIssues.impactNone}</option>
                <ListOptions list="risk-issue.impact" current={item?.Impact} />
              </Select>
            </Field>

            <Field
              label={messages.risksIssues.probability}
              name="probability"
              errors={form.errors.probability}
            >
              <Select name="probability" defaultValue={item?.Probability ?? ""}>
                <option value="">{messages.risksIssues.probabilityNone}</option>
                <ListOptions list="risk-issue.probability" current={item?.Probability} />
              </Select>
            </Field>

            <Field label={messages.risksIssues.owner} name="owner" errors={form.errors.owner}>
              <Input name="owner" maxLength={255} defaultValue={item?.Owner ?? ""} />
            </Field>

            <Field
              label={messages.risksIssues.dateIdentified}
              name="dateIdentified"
              errors={form.errors.dateIdentified}
            >
              <Input
                type="date"
                name="dateIdentified"
                defaultValue={toDateInput(item?.DateIdentified)}
              />
            </Field>

            <Field label={messages.risksIssues.dueDate} name="dueDate" errors={form.errors.dueDate}>
              <Input type="date" name="dueDate" defaultValue={toDateInput(item?.DueDate)} />
            </Field>

            <Field
              label={messages.risksIssues.mitigationPlan}
              name="mitigationPlan"
              errors={form.errors.mitigationPlan}
            >
              <RichTextEditor name="mitigationPlan" defaultValue={item?.MitigationPlan} />
            </Field>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2 px-4 py-2">
            {canEdit ? (
              <Button type="submit" pending={pending} data-testid="risk-issue-save">
                {messages.actions.save}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={requestClose}>
              {messages.actions.cancel}
            </Button>
            {item && canDelete ? (
              <Button
                type="button"
                variant="danger"
                data-testid="risk-issue-delete"
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
            title={messages.confirmDelete.title(messages.risksIssues.entity, label(item, 40))}
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
