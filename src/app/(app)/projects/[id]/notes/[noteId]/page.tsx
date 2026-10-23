import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { guardProjectScope } from "@/lib/project-page-helpers";
import { orNotFound } from "@/lib/row-access";
import { NotebookPage } from "@/modules/notes/components/notebook-page";
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
  if (!guardProjectScope(workspace.note, projectId)) notFound();

  return <NotebookPage workspace={workspace} allows={allows} />;
}
