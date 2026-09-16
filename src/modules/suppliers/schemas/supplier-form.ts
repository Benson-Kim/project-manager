import { z } from "zod";
import { messages } from "@/lib/messages";
import { SUPPLIER_RATINGS } from "./supplier";

/**
 * Supplier form contract (ADR-0009): ONE schema shared by the client sheet
 * form (blur + submit validation over FormData strings) and the server
 * actions. FormData values are strings — this schema coerces them into the
 * repository input shape ("" → null, "YYYY-MM-DD" → Date, vocab → enum).
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

const vocab = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (values as readonly string[]).includes(v), messages.errors.VALIDATION)
    .transform((v) => (v ? (v as T[number]) : null));

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
  rating: vocab(SUPPLIER_RATINGS),
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
