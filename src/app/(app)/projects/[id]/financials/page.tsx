import { notFound, redirect } from "next/navigation";
import { parseProjectId } from "../project-id";
import { financialTabHref } from "./financial-view";

/** /projects/<id>/financials opens the first view of the Financials section. */
export default async function FinancialsPage({ params }: { params: Promise<{ id: string }> }) {
  const projectId = parseProjectId((await params).id);
  if (projectId === null) notFound();
  redirect(financialTabHref(projectId, "budget"));
}
