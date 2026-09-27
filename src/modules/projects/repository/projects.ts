import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  createProjectInput,
  projectListRowSchema,
  projectRowSchema,
  projectSearchRowSchema,
  updateProjectInput,
  type CreateProjectInput,
  type CreateProjectParsed,
  type ProjectFilters,
  type ProjectListRow,
  type ProjectRow,
  type ProjectSearchRow,
  type UpdateProjectInput,
} from "../schemas/project";

/**
 * Project repository — stored procedures only , every row zod-parsed
 * at the boundary (STANDARDS §2.5), list params forwarded 1:1 .
 */

function toProcParams(input: CreateProjectParsed) {
  return {
    ProjectName: input.projectName,
    ProjectManager: input.projectManager ?? null,
    BusinessAnalyst: input.businessAnalyst ?? null,
    ProjectDocs: input.projectDocs ?? null,
    ProjectSponsor: input.projectSponsor ?? null,
    DateOfProject: input.dateOfProject ?? null,
    ProblemStatement: input.problemStatement ?? null,
    CurrentState: input.currentState ?? null,
    FutureState: input.futureState ?? null,
    UserImpact: input.userImpact ?? null,
    Mandate: input.mandate ?? null,
    ProjectStatusCom: input.projectStatusCom ?? null,
    ExistBusMod: input.existBusMod ?? null,
    A1: input.a1,
    DA: input.da,
    DAS: input.das,
    PurchaseOrder: input.purchaseOrder,
    Requisition: input.requisition,
    DO: input.do,
    FinancingSource: input.financingSource ?? null,
    FinancingCost: input.financingCost ?? null,
    RecurrentCost: input.recurrentCost ?? null,
    PurchaseEquipment: input.purchaseEquipment,
    EquipmentNotes: input.equipmentNotes ?? null,
    StartDate: input.startDate ?? null,
    EndDate: input.endDate ?? null,
    SimilarProject: input.similarProject,
    ProjectPriority: input.projectPriority ?? null,
    EstimatedCompletionDate: input.estimatedCompletionDate ?? null,
    ProjectStatus: input.projectStatus ?? null,
    ProjectPhase: input.projectPhase ?? null,
    RiskLevel: input.riskLevel ?? null,
  };
}

export async function createProject(
  input: CreateProjectInput,
  actorUserId: number,
): Promise<ProjectRow> {
  const parsed = createProjectInput.parse(input);
  const rows = await execProc<ProjectRow>("usp_Project_Create", {
    ...toProcParams(parsed),
    ActorUserId: actorUserId,
  });
  return projectRowSchema.parse(rows[0]);
}

export async function getProjectById(projectId: number, actorUserId: number): Promise<ProjectRow> {
  const rows = await execProc<ProjectRow>("usp_Project_GetById", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
  });
  return projectRowSchema.parse(rows[0]);
}

export async function listProjects(
  params: ListParams,
  actorUserId: number,
  filters: ProjectFilters = {},
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<ProjectListRow[]> {
  const rows = await execProc<ProjectListRow>("usp_Project_List", {
    ActorUserId: actorUserId,
    ProjectId: null,
    Status: filters.status ?? null,
    Priority: filters.priority ?? null,
    ...toProcListParams(params, pageSize),
  });
  return rows.map((r) => projectListRowSchema.parse(r));
}

export async function listProjectOptions(actorUserId: number) {
  const rows = await listProjects({ q: undefined, sort: "ProjectName", dir: "asc", view: undefined, page: 1 }, actorUserId, {}, 1000);
  return rows.map((row) => ({ id: row.ProjectId, name: row.ProjectName }));
}

export async function updateProject(
  input: UpdateProjectInput,
  actorUserId: number,
): Promise<ProjectRow> {
  const parsed = updateProjectInput.parse(input);
  const rows = await execProc<ProjectRow>("usp_Project_Update", {
    ProjectId: parsed.projectId,
    ...toProcParams(parsed),
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return projectRowSchema.parse(rows[0]);
}

export async function deleteProject(
  projectId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_Project_Delete", {
    ProjectId: projectId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}

/** Type-ahead search (req 0.2): prefix match on ProjectName, max 20 rows. */
export async function searchProjects(
  prefix: string,
  actorUserId: number,
): Promise<ProjectSearchRow[]> {
  const rows = await execProc<ProjectSearchRow>("usp_Project_Search", {
    Prefix: prefix,
    ActorUserId: actorUserId,
  });
  return rows.map((r) => projectSearchRowSchema.parse(r));
}
