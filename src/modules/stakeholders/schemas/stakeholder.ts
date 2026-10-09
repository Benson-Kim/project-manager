import { z } from "zod";
import { actorAccessFields } from "@/lib/auth/actor-access";
import { listValue, type LookupListKey } from "@/lib/lookup-lists";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * Stakeholder (app.Stakeholder ← tblStakeholders) — zod contracts for the
 * stakeholders module (#6). Row schema mirrors the SELECT shape of
 * usp_Stakeholder_{Create,GetById,List,Update} exactly.
 */

/** Dropdown lists (req row 70; ADR-0022 — migration 018 replaced the CHECK constraints). */
export const STAKEHOLDER_LISTS = [
  "stakeholder.communication-preference",
  "stakeholder.engagement-level",
] as const satisfies readonly LookupListKey[];

export const stakeholderRowSchema = z.object({
  StakeholderId: z.number().int(),
  ProjectId: z.number().int(),
  FirstName: z.string(),
  LastName: z.string().nullable(),
  DepartmentOrganization: z.string().nullable(),
  ProjectRole: z.string().nullable(),
  RoleDescription: z.string().nullable(),
  PhoneNumber: z.string().nullable(),
  PhoneExt: z.string().nullable(),
  Mobile: z.string().nullable(),
  EmailAddress: z.string().nullable(),
  PhysicalLocation: z.string().nullable(),
  OrgTitle: z.string().nullable(),
  CommunicationPreference: z.string().nullable(),
  EngagementLevel: z.string().nullable(),
  AdditionalNotes: z.string().nullable(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type StakeholderRow = z.infer<typeof stakeholderRowSchema>;

export const stakeholderListRowSchema = stakeholderRowSchema.extend({
  TotalCount: z.number().int(),
  ...actorAccessFields,
});

export type StakeholderListRow = z.infer<typeof stakeholderListRowSchema>;

export const createStakeholderInput = z.object({
  projectId: z.coerce.number().int().positive(),
  firstName: z.string().trim().min(1).max(255),
  lastName: z.string().trim().max(255).nullish(),
  departmentOrganization: z.string().trim().max(255).nullish(),
  projectRole: z.string().trim().max(255).nullish(),
  roleDescription: z.string().trim().max(255).nullish(),
  phoneNumber: z.string().trim().max(255).nullish(),
  phoneExt: z.string().trim().max(255).nullish(),
  mobile: z.string().trim().max(255).nullish(),
  emailAddress: z.string().trim().max(255).nullish(),
  physicalLocation: z.string().trim().max(255).nullish(),
  orgTitle: z.string().trim().max(255).nullish(),
  communicationPreference: listValue.nullish(),
  engagementLevel: listValue.nullish(),
  additionalNotes: z.string().nullish(),
});

export type CreateStakeholderInput = z.input<typeof createStakeholderInput>;
export type CreateStakeholderParsed = z.infer<typeof createStakeholderInput>;

export const updateStakeholderInput = createStakeholderInput.extend({
  stakeholderId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateStakeholderInput = z.input<typeof updateStakeholderInput>;
export type UpdateStakeholderParsed = z.infer<typeof updateStakeholderInput>;

export const deleteStakeholderInput = z.object({
  stakeholderId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteStakeholderInput = z.input<typeof deleteStakeholderInput>;

/** Module filter params (URL ⇄ usp_Stakeholder_List @ProjectId/@EngagementLevel). */
export const stakeholderFiltersSchema = z.object({
  project: z.coerce.number().int().positive().optional(),
  engagement: listValue.min(1).optional(),
});

export type StakeholderFilters = z.infer<typeof stakeholderFiltersSchema>;
