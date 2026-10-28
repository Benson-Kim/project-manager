import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { takeUserSlot } from "@/lib/rate-limit";
import { isRowUnavailable, orNotFound } from "@/lib/row-access";
import { getProjectById } from "@/modules/projects/repository/projects";
import { requirementPdf } from "@/modules/requirements/export";
import { listRequirementsForExport } from "@/modules/requirements/repository/requirements";
import { registerType } from "@/modules/requirements/components/register-model";
import { parseProjectId } from "../../project-id";

/**
 * GET /projects/<id>/requirements/pdf — the register as a PDF download (client
 * feedback 2026-10-26; src/lib/pdf.ts, no dependency). Reading needs Viewer on
 * the project, which both procs enforce; a project the actor cannot open
 * answers 404, exactly as a missing one does. ?type= narrows it to one
 * requirement type, validated against the catalog. The file name is built from
 * the id only, so the project's name never reaches a header — it goes in the
 * document's own title instead. Shares the per-person export window (429).
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
    const [project, rows] = await Promise.all([
      orNotFound(getProjectById(projectId, session.userId)),
      listRequirementsForExport(session.userId, projectId, type),
    ]);
    const bytes = requirementPdf(
      rows,
      project.ProjectName ?? messages.app.untitled,
      new Date().toISOString().slice(0, 10),
    );
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="requirements-${projectId}.pdf"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    if (isRowUnavailable(err)) return status(404);
    throw err;
  }
}
