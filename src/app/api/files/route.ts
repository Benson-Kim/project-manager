import { uploadDeps } from "@/modules/file-storage/handlers/deps";
import { fileRoute } from "@/modules/file-storage/handlers/file-route";
import { handleUpload } from "@/modules/file-storage/handlers/upload";

/**
 * POST /api/files — attachment upload (ADR-0026 §3). Outside the proxy matcher
 * (src/proxy.ts), so the body streams with no 10 MB buffer. fileRoute applies
 * the proxy's gate (same-origin, session); the handler checks the owner's access.
 */
export const dynamic = "force-dynamic";

export const POST = fileRoute((request, session) => handleUpload(request, session, uploadDeps));
