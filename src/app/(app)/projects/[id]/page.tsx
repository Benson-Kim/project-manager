import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { orNotFound } from "@/lib/row-access";
import { PageHeader } from "@/components/ui/page-header";
import { AssigneesEditor } from "@/modules/projects/components/assignees-editor";
import { ProjectForm } from "@/modules/projects/components/project-form";
import { listAssigneeOptions } from "@/modules/projects/repository/assignee-options";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { listProjectAssignees } from "@/modules/projects/repository/project-assignees";
import { listProjectPermissions } from "@/modules/projects/repository/project-permissions";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";
import { listUserOptions } from "@/modules/projects/repository/user-options";
import { getProjectCached } from "./get-project";
import { parseProjectId } from "./project-id";

/**
 * Charter workspace — full route  exception): sections Charter,
 * Framework, Financing (ONE form) + the project team (req 0.3, ADR-0021).
 * Deep-linkable so several projects can be open side by side (req 0.1). The
 * project header and section nav come from the nested layout ; the project
 * fetch is shared with the layout via React cache (no double fetch).
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.requireSession();
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) notFound();

  const [project, assignees, allows, titles] = await Promise.all([
    orNotFound(getProjectCached(projectId, session.userId)),
    orNotFound(listProjectAssignees(projectId, session.userId)),
    getProjectPermissions(projectId, session.userId),
    // Team titles are a managed list (migration 021, ADR-0024).
    loadLookupLists(["project-assignee.title"], session),
  ]);

  const canEdit = allows("projects:update");
  const canDelete = allows("projects:delete");

  // People to add and the permission overrides are only needed by managers editing the team.
  const [users, stakeholders, overrides] = canEdit
    ? await Promise.all([
        listUserOptions(session.userId),
        listAssigneeOptions(projectId, session.userId).catch(() => []),
        listProjectPermissions(projectId, session.userId),
      ])
    : [[], [], {}];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
      {/* Like every other project section, the page names itself (ADR-0019). */}
      <PageHeader title={messages.projects.charterSection} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_30rem]">
        <main className="min-w-0">
          <ProjectForm project={project} canEdit={canEdit} canDelete={canDelete} />
        </main>

        <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <LookupListsScope {...titles}>
            <AssigneesEditor
              projectId={projectId}
              initial={assignees}
              users={users}
              stakeholders={stakeholders}
              canEdit={canEdit}
              overrides={overrides}
              actorUserId={session.userId}
              isAdmin={session.role === "Admin"}
            />
          </LookupListsScope>
        </aside>
      </div>
    </div>
  );
}
