import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { AppError } from "@/lib/errors";
import { flattenSearchParams, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
import { StakeholderSheet } from "@/modules/stakeholders/components/stakeholder-sheet";
import { StakeholdersView } from "@/modules/stakeholders/components/stakeholders-view";
import {
  getStakeholderById,
  listStakeholders,
} from "@/modules/stakeholders/repository/stakeholders";
import { stakeholderFiltersSchema } from "@/modules/stakeholders/schemas/stakeholder";

export const metadata: Metadata = {
  title: `${messages.stakeholders.title} — ${messages.app.name}`,
};

function newStakeholderHref(raw: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value && key !== "id") params.set(key, value);
  }
  params.set("id", "new");
  return `/stakeholders?${params.toString()}`;
}

/**
 * Stakeholders cross-project list (legacy top-level route, pre-ADR-0018).
 * New stakeholders should be created via /projects/[id]/stakeholders.
 * This page is retained for direct search/filtering across all projects.
 */
export default async function StakeholdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const raw = await searchParams;
  const flat = flattenSearchParams(raw);
  const params = parseListParams(raw);
  const filtersParsed = stakeholderFiltersSchema.safeParse(flat);
  const filters = filtersParsed.success ? filtersParsed.data : {};

  const isNew = flat.id === "new";
  const selectedId = !isNew && flat.id ? Number(flat.id) : null;

  const [rows, preferredView, selected] = await Promise.all([
    listStakeholders(params, session.userId, filters),
    getViewPreference(session.userId, "stakeholders").catch(() => null),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? getStakeholderById(selectedId, session.userId).catch((err) => {
          if (err instanceof AppError && err.code === "NOT_FOUND") return null;
          throw err;
        })
      : Promise.resolve(null),
  ]);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = can(session.role, "stakeholders:create");
  const canEdit = can(session.role, "stakeholders:update");
  const canDelete = can(session.role, "stakeholders:delete");
  const filtersActive = Boolean(params.q || filters.project || filters.engagement);

  // For the cross-project view the sheet uses the selected row's project, or
  // the filter project if present, otherwise falls back to 0 (create blocked).
  const sheetProjectId = selected?.ProjectId ?? filters.project ?? 0;

  // Only allow creating when we have a resolved project (selected row or filter).
  // Without one, sheetProjectId is 0 and the schema rejects the submission.
  const canCreateHere = canCreate && sheetProjectId > 0;

  const newStakeholderLink = canCreateHere ? (
    <Link
      href={newStakeholderHref(flat)}
      data-testid="new-stakeholder"
      className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-medium text-on-accent"
    >
      {messages.stakeholders.newStakeholder}
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title={messages.stakeholders.title}
        action={newStakeholderLink ?? undefined}
      />
      <div className="mt-3 flex flex-col flex-1">
        <StakeholdersView
          rows={rows}
          totalCount={totalCount}
          page={params.page}
          initialView={params.view ?? preferredView ?? "grid"}
          filtersActive={filtersActive}
          newStakeholderAction={newStakeholderLink ?? undefined}
        />
      </div>
      <StakeholderSheet
        stakeholder={selected}
        isNew={isNew && canCreateHere}
        projectId={sheetProjectId}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
