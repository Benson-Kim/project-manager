import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { AppError } from "@/lib/errors";
import { messages } from "@/lib/messages";
import { GanttClient } from "@/modules/key-deliverables/components/gantt-client";
import { PrintButton } from "@/modules/key-deliverables/components/print-button";
import { getGanttBars } from "@/modules/key-deliverables/repository/key-deliverables";
import type { AssigneeEntry } from "@/modules/key-deliverables/schemas/key-deliverable";

export const metadata: Metadata = {
  title: `${messages.keyDeliverables.ganttTitle} — ${messages.app.name}`,
};

/**
 * Deliverables Gantt (module #9, ADR-0010 full-route exception under the
 * ADR-0018 project workspace): Server Component CSS-grid bar chart from
 * usp_KeyDeliverable_GanttData. The print stylesheet (`print:` variants) is
 * the report/downloadable view.
 *
 * Filtering (status / priority / assignee) is applied client-side inside
 * GanttClient; the full bar list is fetched once server-side.
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

  // Derive unique assignees by id across all bars — safe for names containing commas.
  const seenIds = new Set<number>();
  const allAssignees: AssigneeEntry[] = [];
  for (const bar of bars) {
    for (const a of bar.assignees) {
      if (!seenIds.has(a.id)) {
        seenIds.add(a.id);
        allAssignees.push(a);
      }
    }
  }
  allAssignees.sort((a, b) => a.name.localeCompare(b.name, "en-CA"));

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
      {/* Suspense required: GanttClient calls useSearchParams */}
      <Suspense>
        <GanttClient
          allBars={bars}
          projectId={projectId}
          allAssignees={allAssignees}
        />
      </Suspense>
    </>
  );
}
