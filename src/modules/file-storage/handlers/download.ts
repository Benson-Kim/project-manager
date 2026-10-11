import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline, Readable } from "node:stream";
import type { Session } from "@/lib/auth/types";
import { AppError } from "@/lib/errors";
import { downloadHeaders, json } from "@/lib/files/http";
import { resolveStoredFile, StoredFileChangedError, verifySha256 } from "@/lib/files/store";
import { messages } from "@/lib/messages";
import type { StoredFileRow } from "../repository/attachments";
import { downloadParamsSchema, type AttachmentOwner } from "../schemas/attachment";

/**
 * GET /api/files/<id>?owner=<owner> (ADR-0026 §3). fileRoute has already
 * checked the session; this does the owner's read check, then serves the
 * stored bytes as a download. Anything the actor may not see — unknown id,
 * another project's file, a location row (no bytes), bytes missing on disk or
 * of the wrong size — answers the same 404, like orNotFound. Bytes of the
 * right size whose SHA-256 is wrong end the stream early. Server only.
 */
export interface DownloadDeps {
  uploadsRoot(): Promise<string>;
  getFile(owner: AttachmentOwner, fileAttachmentId: number, actor: number): Promise<StoredFileRow>;
}

const notFound = () =>
  json({ ok: false, error: { code: "NOT_FOUND", message: messages.errors.NOT_FOUND } }, 404);

export async function handleDownload(
  request: Request,
  session: Session,
  id: string,
  deps: DownloadDeps,
): Promise<Response> {
  const params = downloadParamsSchema.safeParse({
    owner: new URL(request.url).searchParams.get("owner"),
    id,
  });
  if (!params.success) return notFound();

  let file: StoredFileRow;
  try {
    file = await deps.getFile(params.data.owner, params.data.id, session.userId);
  } catch (err) {
    if (err instanceof AppError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN_ROW")) {
      return notFound();
    }
    console.error("[files.download] failed:", err);
    return json({ ok: false, error: { code: "INTERNAL", message: messages.errors.INTERNAL } }, 500);
  }
  if (!file.StoragePath || !file.ContentType || !file.Sha256) return notFound();
  const { FileAttachmentId: fileId, Sha256: sha256 } = file;

  let absolute: string;
  let size: number;
  try {
    absolute = resolveStoredFile(await deps.uploadsRoot(), file.StoragePath);
    const info = await stat(absolute);
    if (!info.isFile()) throw new Error("not a file");
    if (file.SizeBytes !== null && info.size !== file.SizeBytes) {
      throw new StoredFileChangedError();
    }
    size = info.size;
  } catch (err) {
    console.error(
      `[files.download] stored bytes missing or changed for attachment ${fileId}:`,
      err,
    );
    return notFound();
  }

  // Same size but other bytes: the stream fails before its last chunk (verifySha256).
  const verified = pipeline(createReadStream(absolute), verifySha256(sha256), (err) => {
    if (err instanceof StoredFileChangedError) {
      console.error(`[files.download] stored bytes changed for attachment ${fileId}`);
    }
  });
  const body = Readable.toWeb(verified) as ReadableStream<Uint8Array>;
  return new Response(body, {
    status: 200,
    headers: downloadHeaders({ fileName: file.FileName, contentType: file.ContentType, size }),
  });
}
