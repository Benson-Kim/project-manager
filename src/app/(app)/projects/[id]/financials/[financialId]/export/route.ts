import { z } from "zod";
import { auth } from "@/lib/auth/provider";
import { toCsv } from "@/lib/csv";
import { isRowUnavailable } from "@/lib/row-access";
import { financialCsvRows } from "@/modules/financials/calc/export";
import { getFinancialSheet } from "@/modules/financials/repository/financials";

/**
 * GET /projects/<id>/financials/<financialId>/export — the financial as CSV
 * (ADR-0029). Reading needs Viewer on the financial's project (the proc); a
 * financial of another project than the path's is not found, like an
 * inaccessible one. The file name is built from the id only, never from the
 * title, so nothing user-typed reaches a header.
 */
export const dynamic = "force-dynamic";

const idSchema = z.coerce.number().int().positive();

function status(code: number): Response {
  return new Response(null, { status: code, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; financialId: string }> },
) {
  const session = await auth.getSession();
  if (!session) return status(401);
  const { id, financialId } = await params;
  const projectId = idSchema.safeParse(id);
  const sheetId = idSchema.safeParse(financialId);
  if (!projectId.success || !sheetId.success) return status(404);

  try {
    const sheet = await getFinancialSheet(sheetId.data, session.userId);
    if (sheet.financial.projectId !== projectId.data) return status(404);
    return new Response(toCsv(financialCsvRows(sheet)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="financials-${sheet.financial.id}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (isRowUnavailable(err)) return status(404);
    throw err;
  }
}
