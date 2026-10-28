import { auth } from "@/lib/auth/provider";
import { toCsv } from "@/lib/csv";
import { takeUserSlot } from "@/lib/rate-limit";
import { isRowUnavailable } from "@/lib/row-access";
import { requirementCsvRows } from "@/modules/requirements/export";
import { listRequirementsForExport } from "@/modules/requirements/repository/requirements";
import { registerType } from "@/modules/requirements/components/register-model";
import { parseProjectId } from "../../project-id";

/**
 * GET /projects/<id>/requirements/export — the register as CSV (client
 * feedback 2026-10-26). Reading needs Viewer on the project, which the list
 * proc enforces; a project the actor cannot open answers 404, exactly as a
 * missing one does, so the route distinguishes neither. ?type= narrows it to
 * one requirement type, validated against the catalog rather than passed
 * through. The file name is built from the id only, so nothing user-typed
 * reaches a header. It shares the per-person export window with the
 * financials routes (429).
 */
export const dynamic = "force-dynamic";

function status(code: number): Response {
  return new Response(null, { status: code, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.getSession();
  if (!session) return status(401);
  const slot = takeUserSlot("exports", session.userId);
  if (!slot.allowed) {
    return new Response(null, {
      status: 429,
      headers: { "Retry-After": String(slot.retryAfterSeconds), "Cache-Control": "no-store" },
    });
  }
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) return status(404);
  const type = registerType(new URL(request.url).searchParams.get("type") ?? undefined);

  try {
    const rows = await listRequirementsForExport(session.userId, projectId, type);
    return new Response(toCsv(requirementCsvRows(rows)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="requirements-${projectId}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (isRowUnavailable(err)) return status(404);
    throw err;
  }
}
