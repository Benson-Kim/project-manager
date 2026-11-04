import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { messages } from "@/lib/messages";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";
import { ProjectForm } from "@/modules/projects/components/project-form";
import { PROJECT_LISTS } from "@/modules/projects/schemas/project-form";

export const metadata: Metadata = {
  title: `${messages.projects.newProject} — ${messages.app.name}`,
};

/** Create project — full route  exception decided for this module). */
export default async function NewProjectPage() {
  const session = await auth.requireSession();
  if (!can(session.role, "projects:create")) redirect("/projects");
  const lists = await loadLookupLists(PROJECT_LISTS, session);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={messages.projects.newProject} />
      <LookupListsScope {...lists}>
        <ProjectForm canEdit canDelete={false} />
      </LookupListsScope>
    </div>
  );
}
