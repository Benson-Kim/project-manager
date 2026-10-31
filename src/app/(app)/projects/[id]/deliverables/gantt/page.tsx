import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { guardProjectScope } from "@/lib/project-page-helpers";
import { orNotFound, orNull } from "@/lib/row-access";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";
import { isGanttScale } from "@/modules/key-deliverables/components/gantt-scale";
import { isWbsView } from "@/modules/key-deliverables/components/wbs-diagram-layout";
import { PrintButton } from "@/modules/key-deliverables/components/print-button";
import { WbsGantt } from "@/modules/key-deliverables/components/wbs-gantt";
import {
  getKeyDeliverableById,
  getWbs,
} from "@/modules/key-deliverables/repository/key-deliverables";
import { listRequirementOptions } from "@/modules/requirements/repository/requirements";
import { listStakeholderOptions } from "@/modules/stakeholders/repository/stakeholder-options";
import { KEY_DELIVERABLE_LISTS } from "@/modules/key-deliverables/schemas/key-deliverable";
import { todayUtc } from "@/modules/key-deliverables/schemas/wbs";
import { getProjectCached } from "../../get-project";
import { parseProjectId } from "../../project-id";

export const metadata: Metadata = {
  title: `${messages.keyDeliverables.ganttTitle} — ${messages.app.name}`,
};

/**
 * WBS and Gantt (module #9, checklist row 67, ADR-0027): the project's key
 * deliverables as a work breakdown that draws the Gantt, edited in place.
 * ?view=wbs|gantt picks the WBS diagram (the default) or the Gantt;
 * ?scale=day|week|month picks the timeline; ?d=<id> opens an item's details.
 * The print stylesheet is the report view.
 */
export default async function DeliverablesGanttPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) notFound();

  const raw = flattenSearchParams(await searchParams);
  const openId = raw.d && /^\d+$/.test(raw.d) ? Number(raw.d) : null;

  const [project, data, allows, assigneeOptions, needOptions, openRaw, lookup] = await Promise.all([
    orNotFound(getProjectCached(projectId, session.userId)),
    orNotFound(getWbs(projectId, session.userId)),
    getProjectPermissions(projectId, session.userId),
    listStakeholderOptions(projectId, session.userId),
    listRequirementOptions(projectId, session.userId),
    openId ? orNull(getKeyDeliverableById(openId, session.userId)) : null,
    loadLookupLists(KEY_DELIVERABLE_LISTS, session),
  ]);
  // A deep link to another project's deliverable is treated as not found.
  const openDeliverable = guardProjectScope(openRaw, projectId) ?? undefined;

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
        <LookupListsScope {...lookup}>
          <WbsGantt
            projectId={projectId}
            projectName={project.ProjectName}
            planNote={{ text: project.PlanNote ?? null, rowVer: project.RowVer }}
            data={data}
            today={todayUtc()}
            initialView={isWbsView(raw.view) ? raw.view : "wbs"}
            initialScale={isGanttScale(raw.scale) ? raw.scale : null}
            canCreate={allows("key-deliverables:create")}
            canEdit={allows("key-deliverables:update")}
            canDelete={allows("key-deliverables:delete")}
            requirementAccess={{
              canCreate: allows("requirements:create"),
              canEdit: allows("requirements:update"),
            }}
            openDeliverable={openDeliverable}
            sheetOpen={Boolean(openDeliverable)}
            assigneeOptions={assigneeOptions}
            needOptions={needOptions}
          />
        </LookupListsScope>
      </div>
    </>
  );
}
