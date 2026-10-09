import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
import { orNotFound, orNull } from "@/lib/row-access";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { StakeholderSheet } from "@/modules/stakeholders/components/stakeholder-sheet";
import { StakeholdersView } from "@/modules/stakeholders/components/stakeholders-view";
import {
  getStakeholderById,
  listStakeholders,
} from "@/modules/stakeholders/repository/stakeholders";
import { ENGAGEMENT_LEVELS } from "@/modules/stakeholders/schemas/stakeholder";
import { buildNewEntityHref, guardProjectScope } from "@/lib/project-page-helpers";
import { parseProjectId } from "../project-id";

export const metadata: Metadata = {
  title: `${messages.stakeholders.title} — ${messages.app.name}`,
};

/**
 * Stakeholders list (module #6): project-scoped section under
 * /projects/[id]/stakeholders ; DataView + search + engagement
 * filter, detail/edit in the URL-synced Sheet (?id=<n> | ?id=new, ADR-0010).
 */
export default async function StakeholdersPage({
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

  const raw = await searchParams;
  const flat = flattenSearchParams(raw);
  const listParams = parseListParams(raw);

  const isNew = flat.id === "new";
  const selectedId = !isNew && flat.id ? Number(flat.id) : null;

  // Narrow engagement to the declared vocab so the repository type is satisfied.
  const rawEngagement = flat.engagement;
  const engagement = (ENGAGEMENT_LEVELS as readonly string[]).includes(rawEngagement ?? "")
    ? (rawEngagement as (typeof ENGAGEMENT_LEVELS)[number])
    : undefined;

  const filters = {
    project: projectId,
    engagement,
  };

  const [rows, preferredView, selectedRaw, allows] = await Promise.all([
    orNotFound(listStakeholders(listParams, session.userId, filters, undefined)),
    getViewPreference(session.userId, "stakeholders").catch(() => null),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? orNull(getStakeholderById(selectedId, session.userId))
      : null,
    getProjectPermissions(projectId, session.userId),
  ]);

  // A deep link to a stakeholder from another project is treated as not found.
  const selected = guardProjectScope(selectedRaw, projectId);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = allows("stakeholders:create");
  const canEdit = allows("stakeholders:update");
  const canDelete = allows("stakeholders:delete");
  const filtersActive = Boolean(listParams.q || flat.engagement);

  const newStakeholderLink = (
    <Link
      href={buildNewEntityHref(`/projects/${projectId}/stakeholders`, flat)}
      data-testid="new-stakeholder"
      className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
    >
      {messages.stakeholders.newStakeholder}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={messages.stakeholders.title}
        action={canCreate ? newStakeholderLink : undefined}
      />
      <div className="mt-3 flex flex-col flex-1">
        <StakeholdersView
          rows={rows}
          totalCount={totalCount}
          page={listParams.page}
          initialView={listParams.view ?? preferredView ?? "grid"}
          filtersActive={filtersActive}
          newStakeholderAction={canCreate ? newStakeholderLink : undefined}
        />
      </div>
      <StakeholderSheet
        stakeholder={selected}
        isNew={isNew && canCreate}
        projectId={projectId}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
