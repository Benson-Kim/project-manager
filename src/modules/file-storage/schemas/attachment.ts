import { z } from "zod";
import { FILE_NAME_MAX, sanitizeFileName } from "@/lib/file-names";
import { messages } from "@/lib/messages";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * Attachments (ADR-0026) — zod contracts shared by the client and the server.
 * Server-only code (storage, sniffing, the owner registry's procs) lives in
 * src/lib/files and src/modules/file-storage/{repository,handlers}.
 */

/**
 * Records that can carry attachments. Each owner has a link table, its procs in
 * its own folder (db/procs/<owner>/usp_<Owner>_{CanAddFile,AddFile,ListFiles,
 * GetFile,RenameFile,RemoveFile}) and an entry in repository/owners.ts.
 */
export const ATTACHMENT_OWNERS = ["daily-activity"] as const;

export const attachmentOwnerSchema = z.enum(ATTACHMENT_OWNERS);

export type AttachmentOwner = z.infer<typeof attachmentOwnerSchema>;

/** STANDARDS §4: at most 25 MB per file. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** What the file picker offers; the server sniffs the bytes whatever the name says. */
export const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  ".png",
  ".jpg",
  ".jpeg",
  ".msg",
  ".eml",
  ".txt",
  ".csv",
] as const;

export const STORAGE_LOCATION_MAX = 500;

/** The row shape of usp_<Owner>_{ListFiles,AddFile,RenameFile}. */
export const attachmentRowSchema = z.object({
  FileAttachmentId: z.number().int(),
  FileName: z.string(),
  /** The sniffed type; null for a location. */
  ContentType: z.string().nullable(),
  /** Null for a location (it has no bytes). BIGINT arrives as a string. */
  SizeBytes: z.coerce.number().int().nullable(),
  /** Where the file is kept (a URL, a network path…) when it was not uploaded. */
  StorageLocation: z.string().nullable(),
  CreatedAtUtc: z.date(),
  CreatedByName: z.string().nullable(),
  RowVer: rowVerSchema,
});

export type AttachmentRow = z.infer<typeof attachmentRowSchema>;

/** A display name, cleaned the same way on both sides (src/lib/file-names.ts). */
export const fileNameSchema = z
  .string()
  .transform((v, ctx) => {
    const clean = sanitizeFileName(v);
    if (clean === null) {
      ctx.addIssue({ code: "custom", message: messages.attachments.errors.nameRequired });
      return z.NEVER;
    }
    return clean;
  })
  .pipe(z.string().max(FILE_NAME_MAX));

export const storageLocationSchema = z
  .string()
  .trim()
  .min(1, messages.attachments.errors.locationRequired)
  .max(STORAGE_LOCATION_MAX)
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), messages.attachments.errors.locationRequired);

const fileAttachmentId = z.coerce.number().int().positive();
const ownerId = z.coerce.number().int().positive();

export const renameAttachmentInput = z.object({
  owner: attachmentOwnerSchema,
  fileAttachmentId,
  rowVer: rowVerSchema,
  fileName: fileNameSchema,
});

export const removeAttachmentInput = z.object({
  owner: attachmentOwnerSchema,
  fileAttachmentId,
  rowVer: rowVerSchema,
});

export const addLocationInput = z.object({
  owner: attachmentOwnerSchema,
  ownerId,
  fileName: fileNameSchema,
  storageLocation: storageLocationSchema,
});

/** The upload's query string: POST /api/files?owner=…&ownerId=…&name=… */
export const uploadQuerySchema = z.object({
  owner: attachmentOwnerSchema,
  ownerId,
  name: fileNameSchema,
});

/** The download's: GET /api/files/<id>?owner=… */
export const downloadParamsSchema = z.object({
  owner: attachmentOwnerSchema,
  id: fileAttachmentId,
});

/** A location opens as a link only when it is a web address; anything else is shown as text. */
export function locationHref(location: string): string | null {
  try {
    const url = new URL(location);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
