import { auth } from "@/lib/auth/provider";
import { toCsv } from "@/lib/csv";
import { takeUserSlot } from "@/lib/rate-limit";
import { isRowUnavailable } from "@/lib/row-access";
import { stakeholderCsvRows } from "@/modules/stakeholders/export";
import { listStakeholdersForExport } from "@/modules/stakeholders/repository/stakeholders";
import { parseProjectId } from "../../project-id";

/**
 * GET /projects/<id>/stakeholders/export: the stakeholder register with its communication plan as CSV.
 * The list proc requires Viewer on the project; a project the actor cannot open answers 404, as a
 * missing one does. The file name comes from the id only. Shares the per-person export window (429).
 */
export const dynamic = "force-dynamic";

function status(code: number): Response {
  return new Response(null, { status: code, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  try {
    const rows = await listStakeholdersForExport(session.userId, projectId);
    return new Response(toCsv(stakeholderCsvRows(rows)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="stakeholders-${projectId}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (isRowUnavailable(err)) return status(404);
    throw err;
  }
}
