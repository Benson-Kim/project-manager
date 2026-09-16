"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { DatePicker, Input, Select } from "@/components/ui/form/inputs";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { createSupplierAction } from "../actions/create-supplier";
import { deleteSupplierAction } from "../actions/delete-supplier";
import { updateSupplierAction } from "../actions/update-supplier";
import { SUPPLIER_RATINGS, type SupplierRow } from "../schemas/supplier";
import { supplierFormSchema, updateSupplierFormSchema } from "../schemas/supplier-form";

function toDateInput(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="border-b border-line pb-2 text-sm font-semibold text-ink">
      {children}
    </h2>
  );
}

/**
 * Supplier detail/edit sheet (ADR-0010 default pattern): edit is the default
 * content, URL-synced via ?id= (numeric id or "new"); closing clears the
 * param and returns focus to the opener row. Project scope comes from the
 * route (ADR-0018) — projectId travels as a hidden field.
 */
export function SupplierSheet({
  supplier,
  isNew,
  projectId,
  canEdit,
  canDelete,
}: {
  supplier: SupplierRow | null;
  isNew: boolean;
  projectId: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { update } = useListUrlState();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const schema = supplier ? updateSupplierFormSchema : supplierFormSchema;
  const form = useZodForm(schema);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const open = isNew || supplier !== null;
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
      const result = supplier
        ? await updateSupplierAction(formData)
        : await createSupplierAction(formData);
      if (result.ok) {
        toast({
          variant: "success",
          title: supplier ? messages.feedback.saved : messages.feedback.created,
        });
        announce(supplier ? messages.feedback.saved : messages.feedback.created);
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
    if (!supplier) return;
    startTransition(async () => {
      const result = await deleteSupplierAction({
        supplierId: supplier.SupplierId,
        rowVer: supplier.RowVer,
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
      title={supplier ? supplier.SupplierName : messages.suppliers.newSupplier}
    >
      <form
        noValidate
        onBlur={canEdit ? form.onBlur : undefined}
        onSubmit={onSubmit}
        data-testid="supplier-form"
        className="flex flex-col gap-5"
      >
        <ErrorSummary message={summary} />
        {conflict ? (
          <div>
            <Button type="button" variant="secondary" onClick={() => router.refresh()}>
              {messages.suppliers.reload}
            </Button>
          </div>
        ) : null}
        <input type="hidden" name="projectId" value={supplier?.ProjectId ?? projectId} />
        {supplier ? (
          <>
            <input type="hidden" name="supplierId" value={supplier.SupplierId} />
            <input type="hidden" name="rowVer" value={supplier.RowVer} />
          </>
        ) : null}

        <fieldset disabled={!canEdit} className="flex flex-col gap-5">
          <section aria-labelledby="supplier-details-heading" className="flex flex-col gap-4">
            <SectionHeading id="supplier-details-heading">
              {messages.suppliers.detailsSection}
            </SectionHeading>
            <Field
              label={messages.suppliers.supplierName}
              name="supplierName"
              errors={form.errors.supplierName}
            >
              <Input name="supplierName" defaultValue={supplier?.SupplierName ?? ""} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={messages.suppliers.contactPerson} name="contactPerson">
                <Input name="contactPerson" defaultValue={supplier?.ContactPerson ?? ""} />
              </Field>
              <Field
                label={messages.suppliers.emailAddress}
                name="emailAddress"
                errors={form.errors.emailAddress}
              >
                <Input
                  name="emailAddress"
                  inputMode="email"
                  defaultValue={supplier?.EmailAddress ?? ""}
                />
              </Field>
            </div>
          </section>

          <section aria-labelledby="supplier-contract-heading" className="flex flex-col gap-4">
            <SectionHeading id="supplier-contract-heading">
              {messages.suppliers.contractSection}
            </SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={messages.suppliers.contractStartDate}
                name="contractStartDate"
                errors={form.errors.contractStartDate}
              >
                <DatePicker
                  name="contractStartDate"
                  defaultValue={toDateInput(supplier?.ContractStartDate)}
                />
              </Field>
              <Field
                label={messages.suppliers.contractEndDate}
                name="contractEndDate"
                errors={form.errors.contractEndDate}
              >
                <DatePicker
                  name="contractEndDate"
                  defaultValue={toDateInput(supplier?.ContractEndDate)}
                />
              </Field>
            </div>
            <Field label={messages.suppliers.rating} name="rating">
              <Select name="rating" defaultValue={supplier?.Rating ?? ""}>
                <option value="">{messages.suppliers.none}</option>
                {SUPPLIER_RATINGS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
          </section>

          <section aria-labelledby="supplier-address-heading" className="flex flex-col gap-4">
            <SectionHeading id="supplier-address-heading">
              {messages.suppliers.addressSection}
            </SectionHeading>
            <Field label={messages.suppliers.address} name="address">
              <Input name="address" defaultValue={supplier?.Address ?? ""} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={messages.suppliers.city} name="city">
                <Input name="city" defaultValue={supplier?.City ?? ""} />
              </Field>
              <Field label={messages.suppliers.provinceOrState} name="provinceOrState">
                <Input name="provinceOrState" defaultValue={supplier?.ProvinceOrState ?? ""} />
              </Field>
              <Field label={messages.suppliers.country} name="country">
                <Input name="country" defaultValue={supplier?.Country ?? ""} />
              </Field>
              <Field label={messages.suppliers.postalCode} name="postalCode">
                <Input name="postalCode" defaultValue={supplier?.PostalCode ?? ""} />
              </Field>
            </div>
          </section>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 pb-2">
          {canEdit ? (
            <Button type="submit" pending={pending} data-testid="supplier-save">
              {messages.actions.save}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={close}>
            {messages.actions.cancel}
          </Button>
          {supplier && canDelete ? (
            <Button
              type="button"
              variant="danger"
              data-testid="supplier-delete"
              onClick={() => setConfirmDelete(true)}
            >
              {messages.actions.delete}
            </Button>
          ) : null}
        </div>
      </form>

      {supplier ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={messages.confirmDelete.title(messages.suppliers.entity, supplier.SupplierName)}
          body={messages.confirmDelete.body}
          confirmLabel={messages.actions.delete}
          onConfirm={onDelete}
          pending={pending}
        />
      ) : null}
    </Sheet>
  );
}
