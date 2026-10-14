import { z } from "zod";
import { extensionOf } from "@/lib/file-names";
import { messages } from "@/lib/messages";
import {
  ACCEPTED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  type AttachmentOwner,
} from "@/modules/file-storage/schemas/attachment";

/**
 * The browser half of an upload (ADR-0026 §3): the raw file as the POST body
 * via XMLHttpRequest, which reports upload progress (fetch cannot). The server
 * re-checks everything; these checks only spare a pointless upload.
 */
export type UploadOutcome = { ok: true; fileName: string } | { ok: false; message: string };

/** Why this file cannot be uploaded, or null. */
export function preflight(file: { name: string; size: number }): string | null {
  if (file.size === 0) return messages.attachments.errors.empty;
  if (file.size > MAX_UPLOAD_BYTES) return messages.attachments.errors.tooLarge;
  const ext = extensionOf(file.name);
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)
    ? null
    : messages.attachments.errors.typeNotAllowed;
}

export function uploadUrl(owner: AttachmentOwner, ownerId: number, name: string): string {
  const query = new URLSearchParams({ owner, ownerId: String(ownerId), name });
  return `/api/files?${query.toString()}`;
}

export function downloadUrl(owner: AttachmentOwner, fileAttachmentId: number): string {
  return `/api/files/${fileAttachmentId}?${new URLSearchParams({ owner }).toString()}`;
}

const responseSchema = z.union([
  z.object({ ok: z.literal(true), data: z.object({ FileName: z.string() }) }),
  z.object({ ok: z.literal(false), error: z.object({ message: z.string().min(1) }) }),
]);

/** The handler answers the ActionResult shape as JSON; anything else is a generic failure. */
export function readUploadResponse(status: number, body: string): UploadOutcome {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }
  const result = responseSchema.safeParse(json);
  if (!result.success) return { ok: false, message: messages.errors.INTERNAL };
  if (result.data.ok) {
    return status >= 200 && status < 300
      ? { ok: true, fileName: result.data.data.FileName }
      : { ok: false, message: messages.errors.INTERNAL };
  }
  return { ok: false, message: result.data.error.message };
}

export function uploadFile(
  file: File,
  owner: AttachmentOwner,
  ownerId: number,
  onProgress: (percent: number) => void,
): Promise<UploadOutcome> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl(owner, ownerId, file.name));
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => resolve(readUploadResponse(xhr.status, xhr.responseText));
    xhr.onerror = () => resolve({ ok: false, message: messages.errors.INTERNAL });
    xhr.onabort = xhr.onerror;
    xhr.send(file);
  });
}
