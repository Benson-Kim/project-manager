import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { Session } from "@/lib/auth/types";
import { AppError } from "@/lib/errors";
import { downloadHeaders, json } from "@/lib/files/http";
import { resolveStoredFile } from "@/lib/files/store";
import { messages } from "@/lib/messages";
import type { StoredFileRow } from "../repository/attachments";
import { downloadParamsSchema, type AttachmentOwner } from "../schemas/attachment";

/**
 * GET /api/files/<id>?owner=<owner> (ADR-0026 §3): the owner's read check, then
 * the stored bytes as a download. Anything the actor may not see — unknown id,
 * another project's file, a location row (no bytes), bytes missing on disk —
 * answers the same 404, like orNotFound. Server only.
 */
export interface DownloadDeps {
  getSession(): Promise<Session | null>;
  uploadsRoot(): Promise<string>;
  getFile(owner: AttachmentOwner, fileAttachmentId: number, actor: number): Promise<StoredFileRow>;
}

const notFound = () =>
  json({ ok: false, error: { code: "NOT_FOUND", message: messages.errors.NOT_FOUND } }, 404);

export async function handleDownload(
  request: Request,
  id: string,
  deps: DownloadDeps,
): Promise<Response> {
  const session = await deps.getSession();
  if (!session) {
    return json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: messages.errors.UNAUTHENTICATED } },
      401,
    );
  }
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
  if (!file.StoragePath || !file.ContentType) return notFound();

  let absolute: string;
  let size: number;
  try {
    absolute = resolveStoredFile(await deps.uploadsRoot(), file.StoragePath);
    const info = await stat(absolute);
    if (!info.isFile()) throw new Error("not a file");
    size = info.size;
  } catch (err) {
    console.error(
      `[files.download] stored bytes missing for attachment ${file.FileAttachmentId}:`,
      err,
    );
    return notFound();
  }

  const body = Readable.toWeb(createReadStream(absolute)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    status: 200,
    headers: downloadHeaders({ fileName: file.FileName, contentType: file.ContentType, size }),
  });
}
