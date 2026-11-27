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
export const ATTACHMENT_OWNERS = ["daily-activity", "financial-document", "note"] as const;

export const attachmentOwnerSchema = z.enum(ATTACHMENT_OWNERS);

export type AttachmentOwner = z.infer<typeof attachmentOwnerSchema>;

/** STANDARDS §4: at most 25 MB per file. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** A note keeps pictures only, so its files are smaller. */
export const NOTE_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"] as const;

export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

/** What the file picker offers; the server sniffs the bytes whatever the name says. */
export const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  ...IMAGE_EXTENSIONS,
  ".msg",
  ".eml",
  ".txt",
  ".csv",
] as const;

/** The types the sniffer can report (parameters such as charset left off). */
export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ...IMAGE_MIME_TYPES,
  "application/vnd.ms-outlook",
  "message/rfc822",
  "text/plain",
  "text/csv",
] as const;

/** What one owner accepts: names the picker offers, types the bytes may be, and the size cap. */
export interface AttachmentAcceptPolicy {
  extensions: readonly string[];
  mimeTypes: readonly string[];
  maxBytes: number;
}

export const DEFAULT_ACCEPT_POLICY: AttachmentAcceptPolicy = {
  extensions: ACCEPTED_EXTENSIONS,
  mimeTypes: ACCEPTED_MIME_TYPES,
  maxBytes: MAX_UPLOAD_BYTES,
};

export const NOTE_ACCEPT_POLICY: AttachmentAcceptPolicy = {
  extensions: IMAGE_EXTENSIONS,
  mimeTypes: IMAGE_MIME_TYPES,
  maxBytes: NOTE_MAX_UPLOAD_BYTES,
};

/** An owner's policy with whatever it leaves out taken from the defaults. */
export function resolveAcceptPolicy(
  accept?: Partial<AttachmentAcceptPolicy>,
): AttachmentAcceptPolicy {
  return { ...DEFAULT_ACCEPT_POLICY, ...accept };
}

export function acceptsExtension(policy: AttachmentAcceptPolicy, extension: string): boolean {
  return policy.extensions.includes(extension.toLowerCase());
}

/** `contentType` may carry parameters: "text/plain; charset=utf-8". */
export function acceptsMimeType(policy: AttachmentAcceptPolicy, contentType: string): boolean {
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  return policy.mimeTypes.includes(type);
}

/** Pictures only: the refusal then names the pictures, not every kind of file. */
export function isImageOnly(policy: AttachmentAcceptPolicy): boolean {
  return policy.mimeTypes.length > 0 && policy.mimeTypes.every((type) => type.startsWith("image/"));
}

/** The size cap as people read it: "10 MB". */
export function uploadLimitLabel(maxBytes: number): string {
  return `${maxBytes / (1024 * 1024)} MB`;
}

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
  inline: z
    .literal("1")
    .optional()
    .transform((value) => value === "1"),
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
