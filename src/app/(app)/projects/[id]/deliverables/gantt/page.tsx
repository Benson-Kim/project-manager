import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { orNotFound } from "@/lib/row-access";
import { GanttClient } from "@/modules/key-deliverables/components/gantt-client";
import { PrintButton } from "@/modules/key-deliverables/components/print-button";
import { getGanttBars } from "@/modules/key-deliverables/repository/key-deliverables";
import {
  KEY_DELIVERABLE_LISTS,
  type AssigneeEntry,
} from "@/modules/key-deliverables/schemas/key-deliverable";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";
import { parseProjectId } from "../../project-id";

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
  const projectId = parseProjectId(id);
  if (projectId === null) notFound();

  const [bars, lookup] = await Promise.all([
    orNotFound(getGanttBars(projectId, session.userId)),
    loadLookupLists(KEY_DELIVERABLE_LISTS, session),
  ]);

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
        <LookupListsScope {...lookup}>
          <GanttClient allBars={bars} projectId={projectId} allAssignees={allAssignees} />
        </LookupListsScope>
      </Suspense>
    </>
  );
}
