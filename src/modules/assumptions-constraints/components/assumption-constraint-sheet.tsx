"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
// ASSUMPTION_CONSTRAINT_TYPE_OPTIONS re-imported for mapped <option> rendering
// (Open/Closed: adding a new type only requires updating the constants + messages).

import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Select, Switch, Textarea } from "@/components/ui/form/inputs";
import { useUnsavedChangesGuard } from "@/components/ui/form/use-unsaved-changes-guard";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import {
  ASSUMPTION_CONSTRAINT_TYPE_OPTIONS,
  type AssumptionConstraintRow,
} from "../schemas/assumption-constraint";
import {
  assumptionConstraintFormSchema,
  updateAssumptionConstraintFormSchema,
} from "../schemas/assumption-constraint-form";
import {
  createAssumptionConstraintAction,
  deleteAssumptionConstraintAction,
  updateAssumptionConstraintAction,
} from "../actions";

/**
 * Assumption/constraint detail/edit sheet (ADR-0010 default pattern):
 * URL-synced via ?id= (numeric id or "new"); closing clears the param.
 * Project scope travels as a hidden field.
 */
export function AssumptionConstraintSheet({
  item,
  isNew,
  projectId,
  canEdit,
  canDelete,
}: {
  item: AssumptionConstraintRow | null;
  isNew: boolean;
  projectId: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { update, searchParams } = useListUrlState();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const schema = item ? updateAssumptionConstraintFormSchema : assumptionConstraintFormSchema;
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
    // Clear the guard ref SYNCHRONOUSLY before calling update() so the
    // history.replaceState intercept in useUnsavedChangesGuard does not see
    // dirtyRef.current===true and re-open the discard dialog (review #4162765945).
    markClean();
    setIsDirty(false);
    setShowUnsaved(false);
    // Preserve the current page so closing a sheet from page 2+ returns to
    // the same page rather than resetting to page 1 (review comment #9).
    update({ id: null, page: searchParams.get("page") ?? null });
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
      const result = item
        ? await updateAssumptionConstraintAction(data)
        : await createAssumptionConstraintAction(data);
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
      const result = await deleteAssumptionConstraintAction({
        assumptionConstraintId: item.AssumptionConstraintId,
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

  const sheetTitle = item
    ? (item.Description ?? messages.app.untitled).length > 60
      ? (item.Description ?? messages.app.untitled).slice(0, 57) + "…"
      : (item.Description ?? messages.app.untitled)
    : messages.assumptionsConstraints.newItem;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
        title={sheetTitle}
      >
        <form
          noValidate
          onBlur={canEdit ? form.onBlur : undefined}
          onSubmit={onSubmit}
          data-testid="assumption-constraint-form"
          className="flex flex-col gap-5"
        >
          <ErrorSummary message={summary} />
          {conflict ? (
            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => window.location.reload()}
              >
                {messages.assumptionsConstraints.reload}
              </Button>
            </div>
          ) : null}

          {/* Hidden fields */}
          <input type="hidden" name="projectId" value={item?.ProjectId ?? projectId} />
          {item ? (
            <>
              <input
                type="hidden"
                name="assumptionConstraintId"
                value={item.AssumptionConstraintId}
              />
              <input type="hidden" name="rowVer" value={item.RowVer} />
            </>
          ) : null}

          <fieldset
            disabled={!canEdit}
            className="flex flex-col gap-5"
            onChange={() => setIsDirty(true)}
          >
            <Field
              label={messages.assumptionsConstraints.description}
              name="description"
              errors={form.errors.description}
            >
              <Textarea
                name="description"
                rows={4}
                defaultValue={item?.Description ?? ""}
              />
            </Field>

            <Field
              label={messages.assumptionsConstraints.type}
              name="type"
              errors={form.errors.type}
            >
              <Select name="type" defaultValue={item?.Type ?? ""}>
                <option value="">{messages.assumptionsConstraints.typeNone}</option>
                {ASSUMPTION_CONSTRAINT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt === "Assumption"
                      ? messages.assumptionsConstraints.typeAssumption
                      : messages.assumptionsConstraints.typeConstraint}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label={messages.assumptionsConstraints.impact}
              name="impact"
              errors={form.errors.impact}
            >
              <Select name="impact" defaultValue={item?.Impact ?? ""}>
                <option value="">{messages.assumptionsConstraints.impactNone}</option>
                <option value="High">{messages.assumptionsConstraints.impactHigh}</option>
                <option value="Medium">{messages.assumptionsConstraints.impactMedium}</option>
                <option value="Low">{messages.assumptionsConstraints.impactLow}</option>
              </Select>
            </Field>

            <Field
              label={messages.assumptionsConstraints.mitigationPlan}
              name="mitigationPlan"
              errors={form.errors.mitigationPlan}
            >
              <Textarea
                name="mitigationPlan"
                rows={3}
                defaultValue={item?.MitigationPlan ?? ""}
              />
            </Field>

            <Switch
              name="isValidated"
              label={messages.assumptionsConstraints.isValidated}
              defaultChecked={item?.IsValidated ?? false}
            />
          </fieldset>

          <div className="flex flex-wrap items-center gap-2 px-4 py-2">
            {canEdit ? (
              <Button
                type="submit"
                pending={pending}
                data-testid="assumption-constraint-save"
              >
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
                data-testid="assumption-constraint-delete"
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
            title={messages.confirmDelete.title(
              messages.assumptionsConstraints.entity,
              (item.Description ?? messages.app.untitled).length > 40
                ? (item.Description ?? messages.app.untitled).slice(0, 37) + "…"
                : (item.Description ?? messages.app.untitled),
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
