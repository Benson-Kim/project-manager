import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  createStakeholderInput,
  stakeholderListRowSchema,
  stakeholderRowSchema,
  updateStakeholderInput,
  type CreateStakeholderInput,
  type CreateStakeholderParsed,
  type StakeholderFilters,
  type StakeholderListRow,
  type StakeholderRow,
  type UpdateStakeholderInput,
} from "../schemas/stakeholder";

/**
 * Stakeholder repository — stored procedures only , every row
 * zod-parsed at the boundary (STANDARDS §2.5), list params forwarded 1:1
 * .
 */

function toProcParams(input: CreateStakeholderParsed) {
  return {
    ProjectId: input.projectId,
    FirstName: input.firstName,
    LastName: input.lastName ?? null,
    DepartmentOrganization: input.departmentOrganization ?? null,
    ProjectRole: input.projectRole ?? null,
    RoleDescription: input.roleDescription ?? null,
    PhoneNumber: input.phoneNumber ?? null,
    PhoneExt: input.phoneExt ?? null,
    Mobile: input.mobile ?? null,
    EmailAddress: input.emailAddress ?? null,
    PhysicalLocation: input.physicalLocation ?? null,
    OrgTitle: input.orgTitle ?? null,
    CommunicationPreference: input.communicationPreference ?? null,
    EngagementLevel: input.engagementLevel ?? null,
    AdditionalNotes: input.additionalNotes ?? null,
  };
}

export async function createStakeholder(
  input: CreateStakeholderInput,
  actorUserId: number,
  actorRole: string,
): Promise<StakeholderRow> {
  const parsed = createStakeholderInput.parse(input);
  const rows = await execProc<StakeholderRow>("usp_Stakeholder_Create", {
    ...toProcParams(parsed),
    ActorUserId: actorUserId,
    ActorRole: actorRole,
  });
  return stakeholderRowSchema.parse(rows[0]);
}

export async function getStakeholderById(
  stakeholderId: number,
  actorUserId: number,
): Promise<StakeholderRow> {
  const rows = await execProc<StakeholderRow>("usp_Stakeholder_GetById", {
    StakeholderId: stakeholderId,
    ActorUserId: actorUserId,
  });
  return stakeholderRowSchema.parse(rows[0]);
}

export async function listStakeholders(
  params: ListParams,
  actorUserId: number,
  filters: StakeholderFilters = {},
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<StakeholderListRow[]> {
  const rows = await execProc<StakeholderListRow>("usp_Stakeholder_List", {
    ActorUserId: actorUserId,
    ProjectId: filters.project ?? null,
    EngagementLevel: filters.engagement ?? null,
    ...toProcListParams(params, pageSize),
  });
  return rows.map((r) => stakeholderListRowSchema.parse(r));
}

export async function updateStakeholder(
  input: UpdateStakeholderInput,
  actorUserId: number,
  actorRole: string,
): Promise<StakeholderRow> {
  const parsed = updateStakeholderInput.parse(input);
  const rows = await execProc<StakeholderRow>("usp_Stakeholder_Update", {
    StakeholderId: parsed.stakeholderId,
    ...toProcParams(parsed),
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
    ActorRole: actorRole,
  });
  return stakeholderRowSchema.parse(rows[0]);
}

export async function deleteStakeholder(
  stakeholderId: number,
  rowVer: number,
  actorUserId: number,
  actorRole: string,
): Promise<void> {
  await execProc("usp_Stakeholder_Delete", {
    StakeholderId: stakeholderId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
    ActorRole: actorRole,
  });
}
