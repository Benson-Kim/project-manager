import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { flattenSearchParams, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
import { ProjectsToolbar } from "@/modules/projects/components/projects-toolbar";
import { ProjectsView } from "@/modules/projects/components/projects-view";
import { listProjects } from "@/modules/projects/repository/projects";
import { projectFiltersSchema } from "@/modules/projects/schemas/project";

export const metadata: Metadata = {
  title: `${messages.projects.title} — ${messages.app.name}`,
};

const newProjectLink = (
  <Link
    href="/projects/new"
    data-testid="new-project"
    className="inline-flex min-h-10 items-center rounded-md bg-accent px-6 text-sm font-medium text-on-accent"
  >
    {messages.projects.newProject}
  </Link>
);

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const raw = await searchParams;
  const params = parseListParams(raw);

  const filtersParsed = projectFiltersSchema.safeParse(flattenSearchParams(raw));
  const filters = filtersParsed.success ? filtersParsed.data : {};

  const [rows, preferredView] = await Promise.all([
    listProjects(params, session.userId, filters),
    getViewPreference(session.userId, "projects").catch(() => null),
  ]);

  const totalCount = rows[0]?.TotalCount ?? 0;

  const canCreate = can(session.role, "projects:create");

  const filtersActive = Boolean(params.q || filters.status || filters.priority);

  return (
    <>
      {/* <ProjectsToolbar /> */}
      <div className="mt-3">
        <ProjectsView
          rows={rows}
          totalCount={totalCount}
          page={params.page}
          initialView={params.view ?? preferredView ?? "grid"}
          filtersActive={filtersActive}
          newProjectAction={canCreate ? newProjectLink : undefined}
        />
      </div>
    </>
  );
}
