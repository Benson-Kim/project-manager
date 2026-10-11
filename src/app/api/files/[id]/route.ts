import { downloadDeps } from "@/modules/file-storage/handlers/deps";
import { handleDownload } from "@/modules/file-storage/handlers/download";
import { fileRoute } from "@/modules/file-storage/handlers/file-route";

/** GET /api/files/<id>?owner=<owner> — attachment download (ADR-0026 §3); fileRoute checks the session. */
export const dynamic = "force-dynamic";

export const GET = fileRoute<{ params: Promise<{ id: string }> }>(
  async (request, session, { params }) =>
    handleDownload(request, session, (await params).id, downloadDeps),
);
