import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { AppError } from "@/lib/errors";
import { flattenSearchParams, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
import {
  StakeholderSheet,
  type ProjectOption,
} from "@/modules/stakeholders/components/stakeholder-sheet";
import { StakeholdersToolbar } from "@/modules/stakeholders/components/stakeholders-toolbar";
import { StakeholdersView } from "@/modules/stakeholders/components/stakeholders-view";
import {
  getStakeholderById,
  listStakeholders,
} from "@/modules/stakeholders/repository/stakeholders";
import { stakeholderFiltersSchema } from "@/modules/stakeholders/schemas/stakeholder";
import { listProjects } from "@/modules/projects/repository/projects";

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
 * Stakeholders list (module #6): DataView + project/engagement filters;
 * detail/edit in the URL-synced Sheet (?id=<n> | ?id=new, ADR-0010).
 * Project-scoped via ?project= — deep-linked from the charter workspace.
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

  const [rows, preferredView, projectRows, selected] = await Promise.all([
    listStakeholders(params, session.userId, filters),
    getViewPreference(session.userId, "stakeholders").catch(() => null),
    listProjects(parseListParams({}), session.userId, {}, 100),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? getStakeholderById(selectedId, session.userId).catch((err) => {
          if (err instanceof AppError && err.code === "NOT_FOUND") return null;
          throw err;
        })
      : Promise.resolve(null),
  ]);

  const projects: ProjectOption[] = projectRows.map((p) => ({
    ProjectId: p.ProjectId,
    ProjectName: p.ProjectName,
  }));
  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = can(session.role, "stakeholders:create");
  const canEdit = can(session.role, "stakeholders:update");
  const canDelete = can(session.role, "stakeholders:delete");
  const filtersActive = Boolean(params.q || filters.project || filters.engagement);

  const newStakeholderLink = (
    <Link
      href={newStakeholderHref(flat)}
      data-testid="new-stakeholder"
      className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-medium text-on-accent"
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
      <StakeholdersToolbar projects={projects} />
      <div className="mt-3">
        <StakeholdersView
          rows={rows}
          totalCount={totalCount}
          page={params.page}
          initialView={params.view ?? preferredView ?? "grid"}
          filtersActive={filtersActive}
          newStakeholderAction={canCreate ? newStakeholderLink : undefined}
        />
      </div>
      <StakeholderSheet
        stakeholder={selected}
        isNew={isNew && canCreate}
        projects={projects}
        defaultProjectId={filters.project}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
