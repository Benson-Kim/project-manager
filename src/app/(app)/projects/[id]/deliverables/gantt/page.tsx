import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { AppError } from "@/lib/errors";
import { messages } from "@/lib/messages";
import { GanttChart } from "@/modules/key-deliverables/components/gantt-chart";
import { PrintButton } from "@/modules/key-deliverables/components/print-button";
import { getGanttBars } from "@/modules/key-deliverables/repository/key-deliverables";

export const metadata: Metadata = {
  title: `${messages.keyDeliverables.ganttTitle} — ${messages.app.name}`,
};

/**
 * Deliverables Gantt (module #9, ADR-0010 full-route exception under the
 * ADR-0018 project workspace): Server Component CSS-grid bar chart from
 * usp_KeyDeliverable_GanttData. The print stylesheet (`print:` variants) is
 * the report/downloadable view.
 */
export default async function DeliverablesGanttPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.requireSession();
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId < 1) notFound();

  let bars;
  try {
    bars = await getGanttBars(projectId, session.userId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <>
      <PageHeader
        title={messages.keyDeliverables.ganttTitle}
        action={
          <div className="flex gap-2 print:hidden">
            <PrintButton />
            <Link
              href={`/projects/${projectId}/deliverables`}
              data-testid="list-link"
              className="inline-flex min-h-10 items-center rounded-md border border-line px-6 text-sm font-medium text-ink"
            >
              {messages.keyDeliverables.listLink}
            </Link>
          </div>
        }
      />
      <div className="mt-3 pb-8">
        <GanttChart bars={bars} projectId={projectId} />
      </div>
    </>
  );
}
