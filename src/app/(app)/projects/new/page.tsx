import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { messages } from "@/lib/messages";
import { ProjectForm } from "@/modules/projects/components/project-form";

export const metadata: Metadata = {
  title: `${messages.projects.newProject} — ${messages.app.name}`,
};

/** Create project — full route (ADR-0010 exception decided for this module). */
export default async function NewProjectPage() {
  const session = await auth.requireSession();
  if (!can(session.role, "projects:create")) redirect("/projects");

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={messages.projects.newProject} />
      <ProjectForm canEdit canDelete={false} />
    </div>
  );
}
