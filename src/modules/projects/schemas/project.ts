import { z } from "zod";
import { LOOKUP_LABEL_MAX } from "@/lib/lookup-lists";
import { actorAccessSchema } from "@/lib/auth/actor-access";
import { ACCESS_LEVELS } from "@/lib/auth/types";

/**
 * Project (app.Project ← tblProjectFramework) — zod contracts for the
 * database-schema-and-procs module (#3). Row schema mirrors the SELECT shape of
 * usp_Project_{Create,GetById,List,Update} exactly; the driver returns
 * DATETIME2 as Date, BIT as boolean and CAST(RowVer AS BIGINT) as a
 * string/number (coerced to number here).
 */
export const rowVerSchema = z.coerce.number().int().nonnegative();

export const projectRowSchema = z.object({
  ProjectId: z.number().int(),
  ProjectName: z.string(),
  ProjectManager: z.string().nullable(),
  BusinessAnalyst: z.string().nullable(),
  ProjectDocs: z.string().nullable(),
  ProjectSponsor: z.string().nullable(),
  DateOfProject: z.date().nullable(),
  ProblemStatement: z.string().nullable(),
  CurrentState: z.string().nullable(),
  FutureState: z.string().nullable(),
  UserImpact: z.string().nullable(),
  Mandate: z.string().nullable(),
  ProjectStatusCom: z.string().nullable(),
  ExistBusMod: z.string().nullable(),
  A1: z.boolean(),
  DA: z.boolean(),
  DAS: z.boolean(),
  PurchaseOrder: z.boolean(),
  Requisition: z.boolean(),
  DO: z.boolean(),
  FinancingSource: z.string().nullable(),
  FinancingCost: z.number().nullable(),
  RecurrentCost: z.number().nullable(),
  PurchaseEquipment: z.boolean(),
  EquipmentNotes: z.string().nullable(),
  StartDate: z.date().nullable(),
  EndDate: z.date().nullable(),
  SimilarProject: z.boolean(),
  ProjectPriority: z.string().nullable(),
  EstimatedCompletionDate: z.date().nullable(),
  ProjectStatus: z.string().nullable(),
  ProjectPhase: z.string().nullable(),
  RiskLevel: z.string().nullable(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type ProjectRow = z.infer<typeof projectRowSchema>;

export const projectListRowSchema = projectRowSchema.extend({
  TotalCount: z.number().int(),
  ActorAccess: actorAccessSchema,
});

export type ProjectListRow = z.infer<typeof projectListRowSchema>;

/** Search-result shape of usp_Project_Search (type-ahead, req 0.2). */
export const projectSearchRowSchema = z.object({
  ProjectId: z.number().int(),
  ProjectName: z.string(),
  RowVer: rowVerSchema,
});

export type ProjectSearchRow = z.infer<typeof projectSearchRowSchema>;

export const createProjectInput = z.object({
  projectName: z.string().trim().min(1).max(255),
  projectManager: z.string().trim().max(255).nullish(),
  businessAnalyst: z.string().trim().max(255).nullish(),
  projectDocs: z.string().nullish(),
  projectSponsor: z.string().trim().max(255).nullish(),
  dateOfProject: z.coerce.date().nullish(),
  problemStatement: z.string().nullish(),
  currentState: z.string().nullish(),
  futureState: z.string().nullish(),
  userImpact: z.string().nullish(),
  mandate: z.string().trim().max(255).nullish(),
  projectStatusCom: z.string().nullish(),
  existBusMod: z.string().trim().max(255).nullish(),
  a1: z.boolean().default(false),
  da: z.boolean().default(false),
  das: z.boolean().default(false),
  purchaseOrder: z.boolean().default(false),
  requisition: z.boolean().default(false),
  do: z.boolean().default(false),
  financingSource: z.string().trim().max(255).nullish(),
  financingCost: z.number().nullish(),
  recurrentCost: z.number().nullish(),
  purchaseEquipment: z.boolean().default(false),
  equipmentNotes: z.string().nullish(),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
  similarProject: z.boolean().default(false),
  projectPriority: z.string().trim().max(50).nullish(),
  estimatedCompletionDate: z.coerce.date().nullish(),
  projectStatus: z.string().trim().max(50).nullish(),
  projectPhase: z.string().trim().max(50).nullish(),
  riskLevel: z.string().trim().max(50).nullish(),
});

/** What callers may pass (defaults still optional). */
export type CreateProjectInput = z.input<typeof createProjectInput>;
/** What the schema guarantees after parsing (defaults applied). */
export type CreateProjectParsed = z.infer<typeof createProjectInput>;

export const updateProjectInput = createProjectInput.extend({
  projectId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateProjectInput = z.input<typeof updateProjectInput>;
export type UpdateProjectParsed = z.infer<typeof updateProjectInput>;

export const deleteProjectInput = z.object({
  projectId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteProjectInput = z.input<typeof deleteProjectInput>;

/** Module filter params (URL ⇄ usp_Project_List @Status/@Priority). */
export const projectFiltersSchema = z.object({
  status: z.string().trim().max(50).optional(),
  priority: z.string().trim().max(50).optional(),
});

export type ProjectFilters = z.infer<typeof projectFiltersSchema>;

/**
 * Project team (app.ProjectAssignee — req 0.3, ADR-0021). Role is the title shown in the
 * team; AccessLevel is what a member linked to a user account may do in this project.
 * Mirrors CK_ProjectAssignee_Role.
 */
/**
 * A team member's title: a label of the managed list 'project-assignee.title'
 * (migration 021, ADR-0024) — display only; access comes from the level and
 * the person's overrides. The proc checks it against the live list.
 */
const assigneeTitle = z.string().trim().min(1).max(LOOKUP_LABEL_MAX);

export const projectAssigneeRowSchema = z.object({
  ProjectAssigneeId: z.number().int(),
  ProjectId: z.number().int(),
  Role: z.string(),
  PersonName: z.string(),
  UserId: z.number().int().nullable(),
  AccessLevel: z.enum(ACCESS_LEVELS),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type ProjectAssigneeRow = z.infer<typeof projectAssigneeRowSchema>;

export const assigneeInput = z.object({
  role: assigneeTitle,
  personName: z.string().trim().min(1).max(255),
  userId: z.number().int().positive().nullish(),
  /** Ignored for rows without a user account: they grant nothing (stored as Viewer). */
  accessLevel: z.enum(ACCESS_LEVELS),
});

export const setProjectAssigneesInput = z.object({
  projectId: z.coerce.number().int().positive(),
  assignees: z.array(assigneeInput).max(100),
});

export type SetProjectAssigneesInput = z.input<typeof setProjectAssigneesInput>;
export type SetProjectAssigneesParsed = z.infer<typeof setProjectAssigneesInput>;
