import { z } from "zod";
import { execProc } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  attachmentRowSchema,
  type AttachmentOwner,
  type AttachmentRow,
} from "../schemas/attachment";
import { ownerConfig } from "./owners";

/**
 * Attachments repository (ADR-0026): stored procedures only, zod row parsing
 * (STANDARDS §2.5). Every call goes to the OWNER's procs, which check access
 * on the owner record (Viewer to read; Contributor + '<owner>:update' to add,
 * rename and remove). The bytes never pass through here: the upload handler
 * stores them and passes their hash and path.
 */

const quotaRowSchema = z.object({
  ProjectId: z.number().int().nullable(),
  /** SUM over BIGINT arrives as a string. */
  UsedBytes: z.coerce.number().nonnegative(),
});

export type AttachmentQuota = z.infer<typeof quotaRowSchema>;

const storedFileRowSchema = z.object({
  FileAttachmentId: z.number().int(),
  FileName: z.string(),
  ContentType: z.string().nullable(),
  SizeBytes: z.coerce.number().int().nullable(),
  Sha256: z.string().nullable(),
  StoragePath: z.string().nullable(),
  StorageLocation: z.string().nullable(),
});

export type StoredFileRow = z.infer<typeof storedFileRowSchema>;

function first<T>(rows: T[], what: string): T {
  if (!rows[0]) throw new AppError("NOT_FOUND", `${what} not found`);
  return rows[0];
}

export async function listAttachments(
  owner: AttachmentOwner,
  ownerId: number,
  actorUserId: number,
): Promise<AttachmentRow[]> {
  const config = ownerConfig(owner);
  const rows = await execProc(config.procs.list, {
    [config.idParam]: ownerId,
    ActorUserId: actorUserId,
  });
  return rows.map((r) => attachmentRowSchema.parse(r));
}

/** The upload pre-check: may the actor add files here, and how full is the quota bucket? */
export async function checkCanAddAttachment(
  owner: AttachmentOwner,
  ownerId: number,
  actorUserId: number,
): Promise<AttachmentQuota> {
  const config = ownerConfig(owner);
  const rows = await execProc(config.procs.canAdd, {
    [config.idParam]: ownerId,
    ActorUserId: actorUserId,
  });
  return quotaRowSchema.parse(first(rows, "Owner"));
}

export interface StoredFileInput {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  storagePath: string;
}

/** Record an uploaded file; the proc re-checks access and enforces the quota (QUOTA_EXCEEDED). */
export async function addFileAttachment(
  owner: AttachmentOwner,
  ownerId: number,
  file: StoredFileInput,
  quotaBytes: number,
  actorUserId: number,
): Promise<AttachmentRow> {
  const config = ownerConfig(owner);
  const rows = await execProc(config.procs.add, {
    [config.idParam]: ownerId,
    FileName: file.fileName,
    ContentType: file.contentType,
    SizeBytes: file.sizeBytes,
    Sha256: file.sha256,
    StoragePath: file.storagePath,
    StorageLocation: null,
    QuotaBytes: quotaBytes,
    ActorUserId: actorUserId,
  });
  return attachmentRowSchema.parse(first(rows, "Attachment"));
}

/** Record where a file is kept, without bytes (checklist row 44). */
export async function addLocationAttachment(
  owner: AttachmentOwner,
  ownerId: number,
  fileName: string,
  storageLocation: string,
  actorUserId: number,
): Promise<AttachmentRow> {
  const config = ownerConfig(owner);
  const rows = await execProc(config.procs.add, {
    [config.idParam]: ownerId,
    FileName: fileName,
    StorageLocation: storageLocation,
    ActorUserId: actorUserId,
  });
  return attachmentRowSchema.parse(first(rows, "Attachment"));
}

/** One attachment for the download handler (NOT_FOUND / FORBIDDEN_ROW both become 404 there). */
export async function getStoredFile(
  owner: AttachmentOwner,
  fileAttachmentId: number,
  actorUserId: number,
): Promise<StoredFileRow> {
  const rows = await execProc(ownerConfig(owner).procs.get, {
    FileAttachmentId: fileAttachmentId,
    ActorUserId: actorUserId,
  });
  return storedFileRowSchema.parse(first(rows, "Attachment"));
}

export async function renameAttachment(
  owner: AttachmentOwner,
  fileAttachmentId: number,
  fileName: string,
  rowVer: number,
  actorUserId: number,
): Promise<AttachmentRow> {
  const rows = await execProc(ownerConfig(owner).procs.rename, {
    FileAttachmentId: fileAttachmentId,
    FileName: fileName,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
  return attachmentRowSchema.parse(first(rows, "Attachment"));
}

export async function removeAttachment(
  owner: AttachmentOwner,
  fileAttachmentId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc(ownerConfig(owner).procs.remove, {
    FileAttachmentId: fileAttachmentId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}

/** Hashes the orphan sweep must keep (Admin only; covers every owner). */
export async function listRetainedHashes(
  graceDays: number,
  actorUserId: number,
): Promise<Set<string>> {
  const rows = await execProc("usp_FileAttachment_ListRetained", {
    GraceDays: graceDays,
    ActorUserId: actorUserId,
  });
  return new Set(rows.map((r) => z.object({ Sha256: z.string() }).parse(r).Sha256));
}
