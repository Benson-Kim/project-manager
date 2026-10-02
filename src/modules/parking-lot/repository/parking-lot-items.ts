import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import type { Role } from "@/lib/auth/types";
import {
  createParkingLotItemInput,
  parkingLotItemListRowSchema,
  parkingLotItemRowSchema,
  updateParkingLotItemInput,
  type CreateParkingLotItemInput,
  type CreateParkingLotItemParsed,
  type ParkingLotItemListRow,
  type ParkingLotItemRow,
  type UpdateParkingLotItemInput,
} from "../schemas/parking-lot-item";

/**
 * ParkingLotItem repository — stored procedures only, zod row parsing
 * (STANDARDS §2.5), list params forwarded 1:1.
 */

export interface ParkingLotListFilters {
  isStrikethrough?: boolean | null;
}

function toProcParams(input: CreateParkingLotItemParsed) {
  return {
    ParkingLotItem: input.parkingLotItem,
    StakeholderId: input.stakeholderId ?? null,
    IsStrikethrough: input.isStrikethrough,
    FollowUpActions: input.followUpActions ?? null,
    Owner: input.owner ?? null,
  };
}

export async function createParkingLotItem(
  input: CreateParkingLotItemInput,
  actorUserId: number,
  actorRole?: Role,
): Promise<ParkingLotItemRow> {
  const parsed = createParkingLotItemInput.parse(input);
  const rows = await execProc<ParkingLotItemRow>("usp_ParkingLotItem_Create", {
    ProjectId: parsed.projectId,
    ...toProcParams(parsed),
    ActorUserId: actorUserId,
    ActorRole: actorRole ?? null,
  });
  return parkingLotItemRowSchema.parse(rows[0]);
}

export async function getParkingLotItemById(
  parkingLotItemId: number,
  actorUserId: number,
): Promise<ParkingLotItemRow> {
  const rows = await execProc<ParkingLotItemRow>("usp_ParkingLotItem_GetById", {
    ParkingLotItemId: parkingLotItemId,
    ActorUserId: actorUserId,
  });
  return parkingLotItemRowSchema.parse(rows[0]);
}

export async function listParkingLotItems(
  params: ListParams,
  actorUserId: number,
  projectId: number | null = null,
  filters: ParkingLotListFilters = {},
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<ParkingLotItemListRow[]> {
  const isStrikethrough =
    filters.isStrikethrough === true
      ? true
      : filters.isStrikethrough === false
        ? false
        : null;
  const rows = await execProc<ParkingLotItemListRow>("usp_ParkingLotItem_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    ...toProcListParams(params, pageSize),
    IsStrikethrough: isStrikethrough,
  });
  return rows.map((r) => parkingLotItemListRowSchema.parse(r));
}

export async function updateParkingLotItem(
  input: UpdateParkingLotItemInput,
  actorUserId: number,
  actorRole?: Role,
): Promise<ParkingLotItemRow> {
  const parsed = updateParkingLotItemInput.parse(input);
  const rows = await execProc<ParkingLotItemRow>("usp_ParkingLotItem_Update", {
    ParkingLotItemId: parsed.parkingLotItemId,
    ProjectId: parsed.projectId,
    ...toProcParams(parsed),
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
    ActorRole: actorRole ?? null,
  });
  return parkingLotItemRowSchema.parse(rows[0]);
}

export async function deleteParkingLotItem(
  parkingLotItemId: number,
  rowVer: number,
  actorUserId: number,
  actorRole?: Role,
): Promise<void> {
  await execProc("usp_ParkingLotItem_Delete", {
    ParkingLotItemId: parkingLotItemId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
    ActorRole: actorRole ?? null,
  });
}
