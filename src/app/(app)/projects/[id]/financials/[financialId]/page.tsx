import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { parseProjectId } from "../../project-id";
import { FINANCIAL_TABS, financialTabHref } from "../financial-view";

const idSchema = z.coerce.number().int().positive();

/**
 * Earlier links to one financial (/financials/<id>?tab=…) open the same view
 * in the Financials section; the view checks the financial belongs to the project.
 */
export default async function FinancialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; financialId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, financialId } = await params;
  const projectId = parseProjectId(id);
  const sheetId = idSchema.safeParse(financialId);
  if (projectId === null || !sheetId.success) notFound();
  const raw = (await searchParams).tab;
  const tab = FINANCIAL_TABS.find((t) => t === raw) ?? "budget";
  redirect(financialTabHref(projectId, tab, sheetId.data));
}
