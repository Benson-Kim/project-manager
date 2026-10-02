import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectSectionNav } from "@/components/shell/project-section-nav";
import { auth } from "@/lib/auth/provider";
import { AppError } from "@/lib/errors";
import { messages } from "@/lib/messages";
import { getProjectCached } from "./get-project";
import { parseProjectId } from "./project-id";

export const metadata: Metadata = {
  title: `${messages.projects.title} — ${messages.app.name}`,
};

/**
 * Project workspace nested layout : validates the id, fetches the
 * project ONCE (React cache shared with section pages), renders the project
 * switcher and ProjectSectionNav above every section.
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
    <div className="flex flex-col flex-1">
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <ProjectSectionNav projectId={projectId} />
      </div>
      <main className="flex flex-col flex-1 py-6 sm:py-8">{children}</main>
    </div>
  );
}
