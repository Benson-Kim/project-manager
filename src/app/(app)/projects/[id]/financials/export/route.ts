import { z } from "zod";
import { auth } from "@/lib/auth/provider";
import { toCsv } from "@/lib/csv";
import { listParamsSchema } from "@/lib/list-params";
import { takeUserSlot } from "@/lib/rate-limit";
import { isRowUnavailable } from "@/lib/row-access";
import { projectCsvRows } from "@/modules/financials/calc/export";
import { getFinancialSheet, listFinancials } from "@/modules/financials/repository/financials";
import type { SheetDto } from "@/modules/financials/schemas/financial";

/**
 * GET /projects/<id>/financials/export — every financial of the project as one
 * CSV, a row each with a column per document (ADR-0030). Reading needs Viewer
 * on the project (usp_Financial_List, then usp_Financial_GetSheet per row,
 * both checked in the procs); a project the actor cannot read is not found.
 * At most 50 financials per project (ADR-0029), read four at a time. The file
 * name is built from the id only. It shares the per-person export window (429).
 */
export const dynamic = "force-dynamic";

const idSchema = z.coerce.number().int().positive();

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
  const projectId = idSchema.safeParse((await params).id);
  if (!projectId.success) return status(404);

  try {
    const rows = await listFinancials(
      listParamsSchema.parse({}),
      session.userId,
      projectId.data,
      100,
    );
    const sheets: SheetDto[] = [];
    for (let i = 0; i < rows.length; i += 4) {
      const batch = await Promise.all(
        rows.slice(i, i + 4).map((r) => getFinancialSheet(r.FinancialId, session.userId)),
      );
      sheets.push(...batch.filter((s) => s.financial.projectId === projectId.data));
    }
    return new Response(toCsv(projectCsvRows(sheets)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="project-${projectId.data}-financials.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (isRowUnavailable(err)) return status(404);
    throw err;
  }
}
