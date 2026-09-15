import { z } from "zod";

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
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type ProjectRow = z.infer<typeof projectRowSchema>;

export const projectListRowSchema = projectRowSchema.extend({
  TotalCount: z.number().int(),
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
});

export type CreateProjectInput = z.infer<typeof createProjectInput>;

export const updateProjectInput = createProjectInput.extend({
  projectId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateProjectInput = z.infer<typeof updateProjectInput>;
