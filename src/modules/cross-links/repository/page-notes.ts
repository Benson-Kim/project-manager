import { execProc } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { buildLocationHref, type LocationAnchor } from "../schemas/location";
import {
  createPageNoteInput,
  deletePageNoteInput,
  getPageNoteInput,
  listPageNotesInput,
  pageNoteDbRowSchema,
  updatePageNoteInput,
  type CreatePageNoteInput,
  type DeletePageNoteInput,
  type PageNoteItem,
  type UpdatePageNoteInput,
} from "../schemas/page-note";

/**
 * Small Page Notes repository — stored procedures only (ADR-0028, ADR-0074).
 */

export function mapPageNoteRow(raw: unknown): PageNoteItem {
  const row = pageNoteDbRowSchema.parse(raw);
  const loc: LocationAnchor = {
    moduleKey: row.ModuleKey,
    projectId: row.ProjectId,
    entityId: row.EntityId,
    subEntityId: row.SubEntityId,
    anchorKind: row.AnchorKind,
    anchorKey: row.AnchorKey,
  };
  return {
    pageNoteId: row.PageNoteId,
    ...loc,
    anchorLabel: row.AnchorLabel,
    body: row.Body,
    color: row.Color,
    href: buildLocationHref(loc, row.ProjectId),
    createdBy: row.CreatedBy,
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
    rowVer: row.RowVer,
  };
}

export async function listPageNotesForLocation(
  input: {
    moduleKey: LocationAnchor["moduleKey"];
    projectId: number | null;
    entityId: number | null;
  },
  actorUserId: number,
): Promise<PageNoteItem[]> {
  const parsed = listPageNotesInput.parse(input);
  const rows = await execProc("usp_PageNote_ListForLocation", {
    ModuleKey: parsed.moduleKey,
    ProjectId: parsed.projectId,
    EntityId: parsed.entityId,
    ActorUserId: actorUserId,
  });
  return rows.map(mapPageNoteRow);
}

export async function getPageNoteById(
  pageNoteId: number,
  actorUserId: number,
): Promise<PageNoteItem> {
  const parsed = getPageNoteInput.parse({ pageNoteId });
  const rows = await execProc("usp_PageNote_GetById", {
    PageNoteId: parsed.pageNoteId,
    ActorUserId: actorUserId,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "Page note not found");
  return mapPageNoteRow(rows[0]);
}

export async function createPageNote(
  input: CreatePageNoteInput,
  actorUserId: number,
): Promise<PageNoteItem> {
  const parsed = createPageNoteInput.parse(input);
  const rows = await execProc("usp_PageNote_Create", {
    ModuleKey: parsed.moduleKey,
    ProjectId: parsed.projectId,
    EntityId: parsed.entityId,
    SubEntityId: parsed.subEntityId,
    AnchorKind: parsed.anchorKind,
    AnchorKey: parsed.anchorKey,
    AnchorLabel: parsed.anchorLabel,
    Body: parsed.body,
    Color: parsed.color,
    ActorUserId: actorUserId,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "Page note not found");
  return mapPageNoteRow(rows[0]);
}

export async function updatePageNote(
  input: UpdatePageNoteInput,
  actorUserId: number,
): Promise<PageNoteItem> {
  const parsed = updatePageNoteInput.parse(input);
  const rows = await execProc("usp_PageNote_Update", {
    PageNoteId: parsed.pageNoteId,
    Body: parsed.body,
    Color: parsed.color,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "Page note not found");
  return mapPageNoteRow(rows[0]);
}

export async function deletePageNote(
  input: DeletePageNoteInput,
  actorUserId: number,
): Promise<{ pageNoteId: number }> {
  const parsed = deletePageNoteInput.parse(input);
  await execProc("usp_PageNote_Delete", {
    PageNoteId: parsed.pageNoteId,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return { pageNoteId: parsed.pageNoteId };
}
