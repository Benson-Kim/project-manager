import { z } from "zod";
import { formText, type FormValues } from "@/components/ui/data-view/datasheet";
import { toDateInput } from "@/lib/format";
import { listChoice } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import type { SupplierRow } from "./supplier";

/**
 * Supplier form contract: ONE schema shared by the client sheet
 * form (blur + submit validation over FormData strings) and the server
 * actions. FormData values are strings — this schema coerces them into the
 * repository input shape ("" → null, "YYYY-MM-DD" → Date; the rating list is checked by the proc).
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const dateInput = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), messages.suppliers.invalidDate)
  .transform((v) => (v ? new Date(v) : null));

export const supplierFormSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  supplierName: z.string().trim().min(1, messages.suppliers.supplierNameRequired).max(255),
  contactPerson: optionalText(255),
  emailAddress: z
    .string()
    .trim()
    .max(255)
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, messages.suppliers.invalidEmail)
    .transform((v) => (v ? v : null)),
  contractStartDate: dateInput,
  contractEndDate: dateInput,
  /** Managed list (ADR-0022): the proc checks the value against the live options. */
  rating: listChoice,
  address: optionalText(255),
  city: optionalText(255),
  provinceOrState: optionalText(255),
  country: optionalText(255),
  postalCode: optionalText(255),
});

export type SupplierFormValues = z.output<typeof supplierFormSchema>;

export const updateSupplierFormSchema = supplierFormSchema.extend({
  supplierId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateSupplierFormValues = z.output<typeof updateSupplierFormSchema>;

/** A supplier as the update form's values — what a datasheet cell edit sends (ADR-0023). */
export function supplierFormValues(row: SupplierRow): FormValues {
  return {
    supplierId: String(row.SupplierId),
    rowVer: String(row.RowVer),
    projectId: String(row.ProjectId),
    supplierName: row.SupplierName,
    contactPerson: formText(row.ContactPerson),
    emailAddress: formText(row.EmailAddress),
    contractStartDate: toDateInput(row.ContractStartDate),
    contractEndDate: toDateInput(row.ContractEndDate),
    rating: formText(row.Rating),
    address: formText(row.Address),
    city: formText(row.City),
    provinceOrState: formText(row.ProvinceOrState),
    country: formText(row.Country),
    postalCode: formText(row.PostalCode),
  };
}
