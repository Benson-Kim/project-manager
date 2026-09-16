import type { Metadata } from "next";
import Link from "next/link";
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
import { getProjectById } from "@/modules/projects/repository/projects";

export const metadata: Metadata = {
  title: `${messages.projects.title} — ${messages.app.name}`,
};

/**
 * Charter workspace — full route (ADR-0010 exception): sections Charter,
 * Framework, Financing (ONE form) + Assignees (req 0.3). Deep-linkable so
 * several projects can be open side by side (req 0.1).
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.requireSession();
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId < 1) notFound();

  let project;
  try {
    project = await getProjectById(projectId, session.userId);
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
      <PageHeader
        title={project.ProjectName}
        action={
          <Link
            href={`/stakeholders?project=${projectId}`}
            data-testid="view-stakeholders"
            className="inline-flex min-h-11 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink"
          >
            {messages.stakeholders.viewStakeholders}
          </Link>
        }
      />
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
