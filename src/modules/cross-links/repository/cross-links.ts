import { execProc } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { buildLocationHref, type LocationAnchor } from "../schemas/location";
import {
  createCrossLinkInput,
  crossLinkDbRowSchema,
  deleteCrossLinkInput,
  getCrossLinkInput,
  listCrossLinksInput,
  updateCrossLinkInput,
  type CreateCrossLinkInput,
  type CrossLinkEndpointDto,
  type CrossLinkItem,
  type DeleteCrossLinkInput,
  type UpdateCrossLinkInput,
} from "../schemas/cross-link";

/**
 * 1-to-1 Cross-links repository — stored procedures only (ADR-0028, ADR-0074).
 * All returned hrefs are constructed server-side from allowlisted module keys
 * and live SQL-resolved ProjectIds; raw URLs are never stored or returned.
 */

function toEndpointDto(loc: LocationAnchor, label: string): CrossLinkEndpointDto {
  return {
    ...loc,
    label,
    href: buildLocationHref(loc, loc.projectId),
  };
}

export function mapCrossLinkRow(raw: unknown): CrossLinkItem {
  const row = crossLinkDbRowSchema.parse(raw);
  const endA = toEndpointDto(
    {
      moduleKey: row.EndAModule,
      projectId: row.EndAProjectId,
      entityId: row.EndAEntityId,
      subEntityId: row.EndASubEntityId,
      anchorKind: row.EndAAnchorKind,
      anchorKey: row.EndAAnchorKey,
    },
    row.EndALabel,
  );
  const endB = toEndpointDto(
    {
      moduleKey: row.EndBModule,
      projectId: row.EndBProjectId,
      entityId: row.EndBEntityId,
      subEntityId: row.EndBSubEntityId,
      anchorKind: row.EndBAnchorKind,
      anchorKey: row.EndBAnchorKey,
    },
    row.EndBLabel,
  );
  const side: "A" | "B" = row.Side ?? "A";
  const here = side === "B" ? endB : endA;
  const there = side === "B" ? endA : endB;

  return {
    crossLinkId: row.CrossLinkId,
    side,
    here,
    there,
    endA,
    endB,
    linkTitle: row.LinkTitle,
    noteText: row.NoteText,
    color: row.Color,
    createdBy: row.CreatedBy,
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
    rowVer: row.RowVer,
  };
}

export async function listCrossLinksForLocation(
  input: {
    moduleKey: LocationAnchor["moduleKey"];
    projectId: number | null;
    entityId: number | null;
  },
  actorUserId: number,
): Promise<CrossLinkItem[]> {
  const parsed = listCrossLinksInput.parse(input);
  const rows = await execProc("usp_CrossLink_ListForLocation", {
    ModuleKey: parsed.moduleKey,
    ProjectId: parsed.projectId,
    EntityId: parsed.entityId,
    ActorUserId: actorUserId,
  });
  return rows.map(mapCrossLinkRow);
}

export async function getCrossLinkById(
  crossLinkId: number,
  actorUserId: number,
): Promise<CrossLinkItem> {
  const parsed = getCrossLinkInput.parse({ crossLinkId });
  const rows = await execProc("usp_CrossLink_GetById", {
    CrossLinkId: parsed.crossLinkId,
    ActorUserId: actorUserId,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "Cross-link not found");
  return mapCrossLinkRow(rows[0]);
}

export async function createCrossLink(
  input: CreateCrossLinkInput,
  actorUserId: number,
): Promise<CrossLinkItem> {
  const parsed = createCrossLinkInput.parse(input);
  const rows = await execProc("usp_CrossLink_Create", {
    EndAModule: parsed.endA.moduleKey,
    EndAProjectId: parsed.endA.projectId,
    EndAEntityId: parsed.endA.entityId,
    EndASubEntityId: parsed.endA.subEntityId,
    EndAAnchorKind: parsed.endA.anchorKind,
    EndAAnchorKey: parsed.endA.anchorKey,
    EndALabel: parsed.endA.label,
    EndBModule: parsed.endB.moduleKey,
    EndBProjectId: parsed.endB.projectId,
    EndBEntityId: parsed.endB.entityId,
    EndBSubEntityId: parsed.endB.subEntityId,
    EndBAnchorKind: parsed.endB.anchorKind,
    EndBAnchorKey: parsed.endB.anchorKey,
    EndBLabel: parsed.endB.label,
    LinkTitle: parsed.linkTitle,
    NoteText: parsed.noteText,
    Color: parsed.color,
    ActorUserId: actorUserId,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "Cross-link not found");
  return mapCrossLinkRow(rows[0]);
}

export async function updateCrossLink(
  input: UpdateCrossLinkInput,
  actorUserId: number,
): Promise<CrossLinkItem> {
  const parsed = updateCrossLinkInput.parse(input);
  const rows = await execProc("usp_CrossLink_Update", {
    CrossLinkId: parsed.crossLinkId,
    LinkTitle: parsed.linkTitle,
    NoteText: parsed.noteText,
    Color: parsed.color,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "Cross-link not found");
  return mapCrossLinkRow(rows[0]);
}

export async function deleteCrossLink(
  input: DeleteCrossLinkInput,
  actorUserId: number,
): Promise<{ crossLinkId: number }> {
  const parsed = deleteCrossLinkInput.parse(input);
  await execProc("usp_CrossLink_Delete", {
    CrossLinkId: parsed.crossLinkId,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return { crossLinkId: parsed.crossLinkId };
}
