import { downloadDeps } from "@/modules/file-storage/handlers/deps";
import { handleDownload } from "@/modules/file-storage/handlers/download";

/** GET /api/files/<id>?owner=<owner> — attachment download (ADR-0026 §3). */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return handleDownload(request, id, downloadDeps);
}
