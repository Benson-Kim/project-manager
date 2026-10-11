import type { Session } from "@/lib/auth/types";
import { AppError, type AppErrorCode } from "@/lib/errors";
import { isSameOrigin, json } from "@/lib/files/http";
import type { ScanResult } from "@/lib/files/scan";
import type { SniffResult } from "@/lib/files/sniff";
import {
  commitUpload,
  discardUpload,
  receiveUpload,
  UploadTooLargeError,
  type ReceivedUpload,
} from "@/lib/files/store";
import { messages } from "@/lib/messages";
import type { AttachmentQuota, StoredFileInput } from "../repository/attachments";
import {
  MAX_UPLOAD_BYTES,
  uploadQuerySchema,
  type AttachmentOwner,
  type AttachmentRow,
} from "../schemas/attachment";

/**
 * POST /api/files?owner=<owner>&ownerId=<id>&name=<file name> — the body is
 * the file itself (ADR-0026 §3). Answers the ActionResult shape as JSON.
 *
 * Order matters: same-origin, session, uploads on, query, declared size, the OWNER's
 * access pre-check, then the disk's free-space floor — all before a single
 * byte of the body is read — then
 * stream to a temp file (hash + 25 MB cap), sniff, scan, store under the hash,
 * and record it through the owner's AddFile proc (authoritative access and
 * quota). Server only; the route file wires the real dependencies.
 */
export interface UploadDeps {
  getSession(): Promise<Session | null>;
  /** False on a desktop PC whose uploads folder an administrator has not set up yet. */
  uploadsEnabled(): boolean;
  uploadsRoot(): Promise<string>;
  quotaBytes(): number;
  /** Free space an upload must leave on the uploads disk (0: no check). */
  minFreeBytes(): number;
  freeBytes(root: string): Promise<number>;
  checkCanAdd(owner: AttachmentOwner, ownerId: number, actor: number): Promise<AttachmentQuota>;
  addFile(
    owner: AttachmentOwner,
    ownerId: number,
    file: StoredFileInput,
    quotaBytes: number,
    actor: number,
  ): Promise<AttachmentRow>;
  sniff(filePath: string, fileName: string): Promise<SniffResult>;
  scan(filePath: string): Promise<ScanResult>;
}

function fail(status: number, code: AppErrorCode, message?: string): Response {
  return json({ ok: false, error: { code, message: message ?? messages.errors[code] } }, status);
}

/** Proc errors → HTTP. NOT_FOUND and FORBIDDEN_ROW look the same, so nothing leaks. */
export function failFromAppError(err: AppError): Response {
  switch (err.code) {
    case "NOT_FOUND":
    case "FORBIDDEN_ROW":
      return fail(404, "NOT_FOUND");
    case "QUOTA_EXCEEDED":
      return fail(422, "QUOTA_EXCEEDED");
    case "VALIDATION":
      return fail(400, "VALIDATION");
    case "CONFLICT":
      return fail(409, "CONFLICT");
    case "UNAUTHENTICATED":
      return fail(401, "UNAUTHENTICATED");
    case "FORBIDDEN":
      return fail(403, "FORBIDDEN");
    default:
      return fail(500, "INTERNAL");
  }
}

export async function handleUpload(request: Request, deps: UploadDeps): Promise<Response> {
  if (!isSameOrigin(request.headers)) return fail(403, "FORBIDDEN");
  const session = await deps.getSession();
  if (!session) return fail(401, "UNAUTHENTICATED");
  if (!deps.uploadsEnabled()) return fail(503, "INTERNAL", messages.attachments.errors.notSetUp);

  const query = uploadQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!query.success) return fail(400, "VALIDATION");
  const { owner, ownerId, name } = query.data;

  const declared = Number(request.headers.get("content-length") ?? Number.NaN);
  if (declared > MAX_UPLOAD_BYTES) {
    return fail(413, "VALIDATION", messages.attachments.errors.tooLarge);
  }
  if (declared === 0 || !request.body) {
    return fail(400, "VALIDATION", messages.attachments.errors.empty);
  }

  const quotaBytes = deps.quotaBytes();
  let pending: ReceivedUpload | null = null;
  try {
    const quota = await deps.checkCanAdd(owner, ownerId, session.userId);
    if (Number.isFinite(declared) && quota.UsedBytes + declared > quotaBytes) {
      return fail(422, "QUOTA_EXCEEDED");
    }

    const root = await deps.uploadsRoot();
    const minFree = deps.minFreeBytes();
    if (minFree > 0) {
      const incoming = Number.isFinite(declared) ? declared : MAX_UPLOAD_BYTES;
      const free = await deps.freeBytes(root);
      if (free - incoming < minFree) {
        console.warn(`[files.upload] refused: ${free} bytes free, floor ${minFree}`);
        return fail(507, "INTERNAL", messages.attachments.errors.diskFull);
      }
    }
    pending = await receiveUpload(request.body, root, MAX_UPLOAD_BYTES);

    const sniffed = await deps.sniff(pending.tempPath, name);
    if (!sniffed.ok) {
      return sniffed.reason === "empty"
        ? fail(400, "VALIDATION", messages.attachments.errors.empty)
        : fail(415, "VALIDATION", messages.attachments.errors.typeNotAllowed);
    }
    const scan = await deps.scan(pending.tempPath);
    if (!scan.clean) {
      console.warn(`[files.upload] scan refused a file: ${scan.reason}`);
      return fail(422, "VALIDATION", messages.attachments.errors.refused);
    }

    const storagePath = await commitUpload(root, pending);
    const stored = pending;
    pending = null; // committed: the orphan sweep owns it if the row below is refused
    const row = await deps.addFile(
      owner,
      ownerId,
      {
        fileName: name,
        contentType: sniffed.contentType,
        sizeBytes: stored.size,
        sha256: stored.sha256,
        storagePath,
      },
      quotaBytes,
      session.userId,
    );
    return json({ ok: true, data: row }, 201);
  } catch (err) {
    if (err instanceof UploadTooLargeError) {
      return fail(413, "VALIDATION", messages.attachments.errors.tooLarge);
    }
    if (err instanceof AppError) return failFromAppError(err);
    console.error("[files.upload] failed:", err);
    return fail(500, "INTERNAL");
  } finally {
    if (pending) await discardUpload(pending);
  }
}
