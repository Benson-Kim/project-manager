import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { AppError } from "@/lib/errors";
import { flattenSearchParams, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
import { guardProjectScope } from "@/lib/project-page-helpers";
import { DeliverablesView } from "@/modules/key-deliverables/components/deliverables-view";
import {
  getKeyDeliverableById,
  listKeyDeliverables,
} from "@/modules/key-deliverables/repository/key-deliverables";
import { listStakeholderOptions } from "@/modules/key-deliverables/repository/stakeholder-options";
import {
  keyDeliverableFiltersSchema,
  type KeyDeliverableRow,
} from "@/modules/key-deliverables/schemas/key-deliverable";
import { getProjectById } from "@/modules/projects/repository/projects";
import { parseProjectId } from "../project-id";

export const metadata: Metadata = {
  title: `${messages.keyDeliverables.title} — ${messages.app.name}`,
};

/**
 * Deliverables list (module #9, ADR-0018 project section): DataView scoped by
 * @ProjectId, status/priority filters, default sort Deadline asc, URL-synced
 * Sheet (?d=new | ?d=<id>).
 */
export default async function DeliverablesPage({
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

  // Validate that the parent project exists and is accessible before listing
  // child records. An unknown/soft-deleted project yields 404 rather than an
  // empty deliverables list or a confusing FK error on create.
  try {
    await getProjectById(projectId, session.userId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const raw = await searchParams;
  const listParams = parseListParams(raw);
  if (!listParams.sort) listParams.sort = "Deadline"; // default sort Deadline asc
  const filtersParsed = keyDeliverableFiltersSchema.safeParse(flattenSearchParams(raw));
  const filters = filtersParsed.success ? filtersParsed.data : {};
  const dParam = flattenSearchParams(raw).d;
  const openId = dParam && /^\d+$/.test(dParam) ? Number(dParam) : null;

  const [rows, preferredView, assigneeOptions, openDeliverableRaw] = await Promise.all([
    listKeyDeliverables(projectId, listParams, session.userId, filters),
    getViewPreference(session.userId, "key-deliverables").catch(() => null),
    listStakeholderOptions(projectId, session.userId),
    openId
      ? getKeyDeliverableById(openId, session.userId).catch((err): KeyDeliverableRow | undefined => {
          if (err instanceof AppError && err.code === "NOT_FOUND") return undefined;
          throw err;
        })
      : Promise.resolve(undefined),
  ]);

  // Guard against deep-linking to a deliverable from another project.
  // guardProjectScope returns null when ProjectId !== projectId.
  const openDeliverable =
    openDeliverableRaw != null
      ? (guardProjectScope(openDeliverableRaw, projectId) ?? undefined)
      : undefined;

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = can(session.role, "key-deliverables:create");
  const canEdit = can(session.role, "key-deliverables:update");
  const canDelete = can(session.role, "key-deliverables:delete");
  const filtersActive = Boolean(listParams.q || filters.status || filters.priority);
  const sheetOpen = dParam === "new" ? canCreate : Boolean(openDeliverable);

  const assigneeNames: Record<number, string> = {};
  for (const o of assigneeOptions) assigneeNames[o.stakeholderId] = o.name;

  const newDeliverableLink = (
    <Link
      href={`/projects/${projectId}/deliverables?d=new`}
      data-testid="new-deliverable"
      className="inline-flex min-h-10 items-center rounded-md bg-accent px-6 text-sm font-medium text-on-accent"
    >
      {messages.keyDeliverables.newDeliverable}
    </Link>
  );
  const ganttLink = (
    <Link
      href={`/projects/${projectId}/deliverables/gantt`}
      data-testid="gantt-link"
      className="inline-flex min-h-10 items-center rounded-md border border-line px-6 text-sm font-medium text-ink"
    >
      {messages.keyDeliverables.ganttLink}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={messages.keyDeliverables.title}
        action={
          <div className="flex gap-2">
            {ganttLink}
            {canCreate ? newDeliverableLink : null}
          </div>
        }
      />
      <div className="mt-3 flex flex-col flex-1">
        <DeliverablesView
          projectId={projectId}
          rows={rows}
          totalCount={totalCount}
          page={listParams.page}
          initialView={listParams.view ?? preferredView ?? "grid"}
          filtersActive={filtersActive}
          openDeliverable={openDeliverable}
          sheetOpen={sheetOpen}
          assigneeOptions={assigneeOptions}
          assigneeNames={assigneeNames}
          canEdit={dParam === "new" ? canCreate : canEdit}
          canDelete={canDelete}
          newAction={canCreate ? newDeliverableLink : undefined}
        />
      </div>
    </>
  );
}
