import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { orNotFound } from "@/lib/row-access";
import { NotebookPage } from "@/modules/notes/components/notebook-page";
import { noteHref } from "@/modules/notes/note-links";
import { getNoteWorkspace } from "@/modules/notes/repository/notes";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { parseProjectId as parseNoteId } from "../../projects/[id]/project-id";

export const metadata: Metadata = {
  title: `${messages.notes.title} — ${messages.app.name}`,
};

/**
 * Notebook workspace in the project-less shared space — /notes/[noteId]. A
 * project's notebook opens under its project, so the project's level applies
 * and the project's navigation shows. One the actor can't open is not found.
 */
export default async function SharedNotePage({ params }: { params: Promise<{ noteId: string }> }) {
  const session = await auth.requireSession();
  const noteId = parseNoteId((await params).noteId);
  if (noteId === null) notFound();

  const workspace = await orNotFound(getNoteWorkspace(noteId, session.userId));
  if (workspace.note.ProjectId !== null) redirect(noteHref(workspace.note));

  const allows = await getProjectPermissions(null, session.userId);
  return <NotebookPage workspace={workspace} allows={allows} />;
}
