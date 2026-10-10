import { uploadDeps } from "@/modules/file-storage/handlers/deps";
import { handleUpload } from "@/modules/file-storage/handlers/upload";

/**
 * POST /api/files — attachment upload (ADR-0026 §3). Outside the proxy matcher
 * (src/proxy.ts), so the body streams with no 10 MB buffer; the handler checks
 * same-origin, the session and the owner's access itself.
 */
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleUpload(request, uploadDeps);
}
