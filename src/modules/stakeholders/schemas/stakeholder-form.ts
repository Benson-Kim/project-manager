import { z } from "zod";
import { messages } from "@/lib/messages";
import { COMMUNICATION_PREFERENCES, ENGAGEMENT_LEVELS } from "./stakeholder";

/**
 * Stakeholder form contract ): ONE schema shared by the client sheet
 * form (blur + submit validation over FormData strings) and the server
 * actions. FormData values are strings — this schema coerces them into the
 * repository input shape ("" → null, vocab strings → enum | null).
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const memo = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

const vocab = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (values as readonly string[]).includes(v), messages.errors.VALIDATION)
    .transform((v) => (v ? (v as T[number]) : null));

export const stakeholderFormSchema = z.object({
  projectId: z.coerce.number().int().positive(messages.stakeholders.projectRequired),
  firstName: z.string().trim().min(1, messages.stakeholders.firstNameRequired).max(255),
  lastName: optionalText(255),
  departmentOrganization: optionalText(255),
  projectRole: optionalText(255),
  roleDescription: optionalText(255),
  phoneNumber: optionalText(255),
  phoneExt: optionalText(255),
  mobile: optionalText(255),
  emailAddress: z
    .string()
    .trim()
    .max(255)
    .optional()
    .refine(
      (v) => !v || z.string().email().safeParse(v).success,
      messages.stakeholders.invalidEmail,
    )
    .transform((v) => (v ? v : null)),
  physicalLocation: optionalText(255),
  orgTitle: optionalText(255),
  communicationPreference: vocab(COMMUNICATION_PREFERENCES),
  engagementLevel: vocab(ENGAGEMENT_LEVELS),
  additionalNotes: memo,
});

export type StakeholderFormValues = z.output<typeof stakeholderFormSchema>;

export const updateStakeholderFormSchema = stakeholderFormSchema.extend({
  stakeholderId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateStakeholderFormValues = z.output<typeof updateStakeholderFormSchema>;
