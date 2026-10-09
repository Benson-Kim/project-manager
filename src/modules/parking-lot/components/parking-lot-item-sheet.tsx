"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Switch, Textarea } from "@/components/ui/form/inputs";
import { useUnsavedChangesGuard } from "@/components/ui/form/use-unsaved-changes-guard";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import type { ParkingLotItemRow } from "../schemas/parking-lot-item";
import {
  parkingLotItemFormSchema,
  updateParkingLotItemFormSchema,
} from "../schemas/parking-lot-item-form";
import {
  createParkingLotItemAction,
  deleteParkingLotItemAction,
  updateParkingLotItemAction,
} from "../actions";

/**
 * Parking lot detail/edit sheet (ADR-0010 default pattern): URL-synced via ?id=
 * (numeric id or "new"); closing clears the param. Project scope travels as a
 * hidden field. The resolved toggle maps to IsStrikethrough.
 */
export function ParkingLotItemSheet({
  item,
  isNew,
  projectId,
  canEdit,
  canDelete,
}: {
  item: ParkingLotItemRow | null;
  isNew: boolean;
  projectId: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { update, searchParams } = useListUrlState();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const schema = item ? updateParkingLotItemFormSchema : parkingLotItemFormSchema;
  const form = useZodForm(schema);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const pendingNavRef = useRef<(() => void) | null>(null);
  useUnsavedChangesGuard(isDirty);

  useEffect(() => {
    function handleBeforeNavigate(e: Event) {
      if (!isDirty) return;
      e.preventDefault();
      const detail = (e as CustomEvent<{ resume?: unknown }>).detail;
      const resume = typeof detail?.resume === "function" ? (detail.resume as () => void) : null;
      pendingNavRef.current = resume;
      setShowUnsaved(true);
    }
    window.addEventListener("before-navigate", handleBeforeNavigate);
    return () => window.removeEventListener("before-navigate", handleBeforeNavigate);
  }, [isDirty]);

  const close = () => {
    setIsDirty(false);
    setShowUnsaved(false);
    setSummary(null);
    setConflict(false);
    form.reset();
    // Preserve the current page: update() strips 'page' unless explicitly included.
    const currentPage = searchParams.get("page");
    update({ id: null, ...(currentPage ? { page: currentPage } : {}) });
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
        ? await updateParkingLotItemAction(data)
        : await createParkingLotItemAction(data);
      if (result.ok) {
        toast({
          variant: "success",
          title: item ? messages.feedback.saved : messages.feedback.created,
        });
        announce(item ? messages.feedback.saved : messages.feedback.created);
        close();
        router.refresh();
      } else {
        if (result.error.code === "UNAUTHENTICATED") {
          router.push(`/login?reason=expired`);
          return;
        }
        form.applyResult(result);
        setSummary(result.error.message);
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });
  };

  const onDelete = () => {
    if (!item) return;
    startTransition(async () => {
      const result = await deleteParkingLotItemAction({
        parkingLotItemId: item.ParkingLotItemId,
        rowVer: item.RowVer,
      });
      setConfirmDelete(false);
      if (result.ok) {
        toast({ variant: "success", title: messages.feedback.deleted });
        announce(messages.feedback.deleted);
        close();
        router.refresh();
      } else {
        if (result.error.code === "UNAUTHENTICATED") {
          router.push(`/login?reason=expired`);
          return;
        }
        setSummary(result.error.message);
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });
  };

  const open = isNew || item !== null;

  const sheetTitle = item
    ? (item.ParkingLotItem ?? messages.app.untitled).length > 60
      ? (item.ParkingLotItem ?? messages.app.untitled).slice(0, 57) + "…"
      : (item.ParkingLotItem ?? messages.app.untitled)
    : messages.parkingLot.newItem;

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
          data-testid="parking-lot-form"
          className="flex flex-col gap-5"
        >
          <ErrorSummary message={summary} />
          {conflict ? (
            <div>
              <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
                {messages.parkingLot.reload}
              </Button>
            </div>
          ) : null}

          {/* Hidden fields */}
          <input type="hidden" name="projectId" value={item?.ProjectId ?? projectId} />
          {item ? (
            <>
              <input type="hidden" name="parkingLotItemId" value={item.ParkingLotItemId} />
              <input type="hidden" name="rowVer" value={item.RowVer} />
            </>
          ) : null}

          {!canEdit ? (
            <p id="read-only-desc" className="sr-only">
              {messages.app.readOnly}
            </p>
          ) : null}
          <fieldset
            disabled={!canEdit}
            aria-describedby={!canEdit ? "read-only-desc" : undefined}
            className="flex flex-col gap-5"
            onChange={() => setIsDirty(true)}
          >
            <Field
              label={messages.parkingLot.item}
              name="parkingLotItem"
              errors={form.errors.parkingLotItem}
            >
              <Textarea name="parkingLotItem" rows={4} defaultValue={item?.ParkingLotItem ?? ""} />
            </Field>

            <Field
              label={messages.parkingLot.participant}
              name="stakeholderId"
              errors={form.errors.stakeholderId}
            >
              <Input
                name="stakeholderId"
                type="number"
                min="1"
                defaultValue={item?.StakeholderId ?? ""}
              />
            </Field>

            <Field
              label={messages.parkingLot.followUpActions}
              name="followUpActions"
              errors={form.errors.followUpActions}
            >
              <Textarea
                name="followUpActions"
                rows={3}
                defaultValue={item?.FollowUpActions ?? ""}
              />
            </Field>

            <Field label={messages.parkingLot.owner} name="owner" errors={form.errors.owner}>
              <Input name="owner" defaultValue={item?.Owner ?? ""} />
            </Field>

            <Switch
              name="isStrikethrough"
              label={messages.parkingLot.strikethrough}
              defaultChecked={item?.IsStrikethrough ?? false}
            />
          </fieldset>

          <div className="flex flex-wrap items-center gap-2 px-4 py-2">
            {canEdit ? (
              <Button type="submit" pending={pending} data-testid="parking-lot-save">
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
                data-testid="parking-lot-delete"
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
              messages.parkingLot.entity,
              (item.ParkingLotItem ?? messages.app.untitled).length > 40
                ? (item.ParkingLotItem ?? messages.app.untitled).slice(0, 37) + "…"
                : (item.ParkingLotItem ?? messages.app.untitled),
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
