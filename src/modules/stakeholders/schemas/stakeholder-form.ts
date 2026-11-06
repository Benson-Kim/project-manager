import { z } from "zod";
import { formText, type FormValues } from "@/components/ui/data-view/datasheet";
import { listChoice } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { isStance } from "../matrix";
import type { StakeholderRow } from "./stakeholder";

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

const scoreText = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || (/^\d{1,3}$/.test(v) && Number(v) <= 100),
    messages.stakeholders.scoreRange,
  )
  .transform((v) => (v === "" ? null : Number(v)));

const stanceText = z
  .string()
  .refine((v) => v === "" || isStance(v))
  .transform((v) => (isStance(v) ? v : null));

/** The update form always carries the place and stance, so an omitted one is refused, never cleared. */
const placeFields = { power: scoreText, interest: scoreText, stance: stanceText };

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
  /** Managed lists (ADR-0022): the proc checks the value against the live options. */
  communicationPreference: listChoice,
  engagementLevel: listChoice,
  communicationPurpose: listChoice,
  communicationFrequency: listChoice,
  keyMessageStrategy: memo,
  additionalNotes: memo,
  power: scoreText.optional().transform((v) => v ?? null),
  interest: scoreText.optional().transform((v) => v ?? null),
  stance: stanceText.optional().transform((v) => v ?? null),
});

export type StakeholderFormValues = z.output<typeof stakeholderFormSchema>;

export const updateStakeholderFormSchema = stakeholderFormSchema.extend({
  stakeholderId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
  ...placeFields,
});

export type UpdateStakeholderFormValues = z.output<typeof updateStakeholderFormSchema>;

/** A stakeholder as the update form's values — what a datasheet cell edit sends (ADR-0023). */
export function stakeholderFormValues(row: StakeholderRow): FormValues {
  return {
    stakeholderId: String(row.StakeholderId),
    rowVer: String(row.RowVer),
    projectId: String(row.ProjectId),
    firstName: row.FirstName,
    lastName: formText(row.LastName),
    departmentOrganization: formText(row.DepartmentOrganization),
    projectRole: formText(row.ProjectRole),
    roleDescription: formText(row.RoleDescription),
    phoneNumber: formText(row.PhoneNumber),
    phoneExt: formText(row.PhoneExt),
    mobile: formText(row.Mobile),
    emailAddress: formText(row.EmailAddress),
    physicalLocation: formText(row.PhysicalLocation),
    orgTitle: formText(row.OrgTitle),
    communicationPreference: formText(row.CommunicationPreference),
    engagementLevel: formText(row.EngagementLevel),
    communicationPurpose: formText(row.CommunicationPurpose),
    communicationFrequency: formText(row.CommunicationFrequency),
    keyMessageStrategy: formText(row.KeyMessageStrategy),
    additionalNotes: formText(row.AdditionalNotes),
    power: row.Power === null ? "" : String(row.Power),
    interest: row.Interest === null ? "" : String(row.Interest),
    stance: formText(row.Stance),
  };
}
