import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { flattenSearchParams, parseListParams, initialViewOf } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getListPreference } from "@/lib/repositories/view-preference";
import { ProjectsToolbar } from "@/modules/projects/components/projects-toolbar";
import { ProjectsView } from "@/modules/projects/components/projects-view";
import { listProjects } from "@/modules/projects/repository/projects";
import { projectFiltersSchema } from "@/modules/projects/schemas/project";
import { PROJECT_LISTS } from "@/modules/projects/schemas/project-form";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";

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

  const [rows, preference, lookup] = await Promise.all([
    listProjects(params, session.userId, filters),
    getListPreference(session.userId, "projects").catch(() => null),
    loadLookupLists(PROJECT_LISTS, session),
  ]);

  const totalCount = rows[0]?.TotalCount ?? 0;

  const canCreate = can(session.role, "projects:create");

  const filtersActive = Boolean(params.q || filters.status || filters.priority);

  return (
    <>
      {/* The top bar shows the title; the page still needs its heading for assistive tech. */}
      <h1 className="sr-only">{messages.projects.title}</h1>
      {/* <ProjectsToolbar /> */}
      <LookupListsScope {...lookup}>
        <div className="mt-3">
          <ProjectsView
            rows={rows}
            totalCount={totalCount}
            page={params.page}
            initialView={initialViewOf(params.view, preference?.viewMode)}
            layout={preference?.layout}
            filtersActive={filtersActive}
            canCreate={canCreate}
            newProjectAction={canCreate ? newProjectLink : undefined}
          />
        </div>
      </LookupListsScope>
    </>
  );
}
