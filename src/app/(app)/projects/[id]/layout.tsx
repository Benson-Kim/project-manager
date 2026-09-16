import { notFound } from "next/navigation";
import { ProjectHeader } from "@/components/shell/project-header";
import { ProjectSectionNav } from "@/components/shell/project-section-nav";
import { auth } from "@/lib/auth/provider";
import { AppError } from "@/lib/errors";
import { messages } from "@/lib/messages";
import type { Metadata } from "next";
import { getProjectCached } from "./get-project";
import { parseProjectId } from "./project-id";

export const metadata: Metadata = {
  title: `${messages.projects.title} — ${messages.app.name}`,
};

/**
 * Project workspace nested layout (ADR-0018): validates the id, fetches the
 * project ONCE (React cache shared with section pages), renders ProjectHeader
 * (breadcrumb + name + badges) and ProjectSectionNav above every section.
 */
export default async function ProjectWorkspaceLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
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

  return (
    <div className="flex flex-col gap-2">
      <ProjectHeader
        name={project.ProjectName}
        status={project.ProjectStatus}
        priority={project.ProjectPriority}
      />
      <ProjectSectionNav projectId={projectId} />
      {children}
    </div>
  );
}
