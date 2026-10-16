import { z } from "zod";
import { auth } from "@/lib/auth/provider";
import { takeUserSlot } from "@/lib/rate-limit";
import { isRowUnavailable } from "@/lib/row-access";
import { financialReport } from "@/modules/financials/calc/report";
import { financialPdf } from "@/modules/financials/calc/report-pdf";
import { getFinancialSheet } from "@/modules/financials/repository/financials";

/**
 * GET /projects/<id>/financials/<financialId>/pdf — the financial report as a
 * PDF download (ADR-0030; src/lib/pdf.ts, no dependency). Reading needs Viewer
 * on the financial's project (the proc); a financial of another project than
 * the path's is not found, like an inaccessible one. The file name is built
 * from the id only, so nothing user-typed reaches a header. It shares the
 * per-person export window with the CSV routes (429).
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
  const slot = takeUserSlot("exports", session.userId);
  if (!slot.allowed) {
    return new Response(null, {
      status: 429,
      headers: { "Retry-After": String(slot.retryAfterSeconds), "Cache-Control": "no-store" },
    });
  }
  const { id, financialId } = await params;
  const projectId = idSchema.safeParse(id);
  const sheetId = idSchema.safeParse(financialId);
  if (!projectId.success || !sheetId.success) return status(404);

  try {
    const sheet = await getFinancialSheet(sheetId.data, session.userId);
    if (sheet.financial.projectId !== projectId.data) return status(404);
    const bytes = financialPdf(financialReport(sheet), new Date().toISOString().slice(0, 10));
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="financials-${sheet.financial.id}.pdf"`,
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
