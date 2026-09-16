import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { AppError } from "@/lib/errors";
import { messages } from "@/lib/messages";
import { AssigneesEditor } from "@/modules/projects/components/assignees-editor";
import { ProjectForm } from "@/modules/projects/components/project-form";
import { listAssigneeOptions } from "@/modules/projects/repository/assignee-options";
import { listProjectAssignees } from "@/modules/projects/repository/project-assignees";
import { getProjectCached } from "./get-project";
import { parseProjectId } from "./project-id";

/**
 * Charter workspace — full route (ADR-0010 exception): sections Charter,
 * Framework, Financing (ONE form) + Assignees (req 0.3). Deep-linkable so
 * several projects can be open side by side (req 0.1). The project header and
 * section nav come from the nested layout (ADR-0018); the project fetch is
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
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={messages.projects.charterSection} />
      <ProjectForm project={project} canEdit={canEdit} canDelete={canDelete} />
      <AssigneesEditor
        projectId={projectId}
        initial={assignees}
        options={options}
        canEdit={canEdit}
      />
    </div>
  );
}
