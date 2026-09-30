import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { AppError } from "@/lib/errors";
import { AssigneesEditor } from "@/modules/projects/components/assignees-editor";
import { ProjectForm } from "@/modules/projects/components/project-form";
import { listAssigneeOptions } from "@/modules/projects/repository/assignee-options";
import { listProjectAssignees } from "@/modules/projects/repository/project-assignees";
import { getProjectCached } from "./get-project";
import { parseProjectId } from "./project-id";

/**
 * Charter workspace — full route  exception): sections Charter,
 * Framework, Financing (ONE form) + Assignees (req 0.3). Deep-linkable so
 * several projects can be open side by side (req 0.1). The project header and
 * section nav come from the nested layout ; the project fetch is
 * shared with the layout via React cache (no double fetch).
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.requireSession();
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) notFound();

  let project;
  try {
    project = await getProjectCached(projectId, session.userId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const [assignees, options] = await Promise.all([
    listProjectAssignees(projectId, session.userId),
    listAssigneeOptions(projectId, session.userId).catch(() => []),
  ]);

  const canEdit = can(session.role, "projects:update");
  const canDelete = can(session.role, "projects:delete");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_30rem]">
        <main className="min-w-0">
          <ProjectForm project={project} canEdit={canEdit} canDelete={canDelete} />
        </main>

        <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <AssigneesEditor
            projectId={projectId}
            initial={assignees}
            options={options}
            canEdit={canEdit}
          />
        </aside>
      </div>
    </div>
  );
}
