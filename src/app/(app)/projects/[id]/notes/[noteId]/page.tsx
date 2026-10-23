import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { RichTextView } from "@/components/ui/rich-text/rich-text-view";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { guardProjectScope } from "@/lib/project-page-helpers";
import { orNotFound } from "@/lib/row-access";
import { NotebookWorkspace } from "@/modules/notes/components/notebook-workspace";
import { getNoteWorkspace } from "@/modules/notes/repository/notes";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { parseProjectId } from "../../project-id";

export const metadata: Metadata = {
  title: `${messages.notes.title} — ${messages.app.name}`,
};

/**
 * Notebook workspace — /projects/[id]/notes/[noteId], a full route: the notebook
 * title, a tablist of pages and the rich-text editor for the active page.
 * A notebook of another project, or one the actor can't open, is not found.
 */
export default async function NotePage({
  params,
}: {
  params: Promise<{ id: string; noteId: string }>;
}) {
  const session = await auth.requireSession();
  const { id, noteId: rawNoteId } = await params;
  const projectId = parseProjectId(id);
  const noteId = parseProjectId(rawNoteId);
  if (projectId === null || noteId === null) notFound();

  const [workspace, allows] = await Promise.all([
    orNotFound(getNoteWorkspace(noteId, session.userId)),
    getProjectPermissions(projectId, session.userId),
  ]);
  const note = guardProjectScope(workspace.note, projectId);
  if (!note) notFound();

  const canUpdate = allows("notes:update");
  const views = canUpdate
    ? {}
    : Object.fromEntries(
        workspace.tabs.map((tab) => [
          tab.NoteTabId,
          <RichTextView key={tab.NoteTabId} html={tab.Content} />,
        ]),
      );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        href={`/projects/${projectId}/notes`}
        data-testid="notes-back"
        className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline"
      >
        {messages.notes.backToList}
      </Link>
      <PageHeader title={note.Title ?? messages.notes.untitled} />
      <NotebookWorkspace
        note={note}
        tabs={workspace.tabs}
        views={views}
        listHref={`/projects/${projectId}/notes`}
        canCreate={allows("notes:create")}
        canUpdate={canUpdate}
        canDelete={allows("notes:delete")}
      />
    </div>
  );
}
