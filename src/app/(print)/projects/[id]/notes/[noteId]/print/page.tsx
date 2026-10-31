import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { parseProjectId } from "@/app/(app)/projects/[id]/project-id";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { guardProjectScope } from "@/lib/project-page-helpers";
import { orNotFound } from "@/lib/row-access";
import { NotebookPrint } from "@/modules/notes/components/notebook-print";
import { getNoteWorkspace } from "@/modules/notes/repository/notes";

type Params = Promise<{ id: string; noteId: string }>;

/** One workspace read per request, shared by the title and the page. */
const load = cache(async (rawProjectId: string, rawNoteId: string) => {
  const session = await auth.requireSession();
  const projectId = parseProjectId(rawProjectId);
  const noteId = parseProjectId(rawNoteId);
  if (projectId === null || noteId === null) notFound();

  const workspace = await orNotFound(getNoteWorkspace(noteId, session.userId));
  if (!guardProjectScope(workspace.note, projectId)) notFound();
  return workspace;
});

/** The notebook's title names the saved PDF. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, noteId } = await params;
  const { note } = await load(id, noteId);
  return { title: note.Title ?? messages.notes.untitled };
}

/**
 * A project's notebook on paper — /projects/[id]/notes/[noteId]/print, outside
 * the app shell. A notebook of another project, or one the actor can't open,
 * is not found.
 */
export default async function ProjectNotePrintPage({ params }: { params: Params }) {
  const { id, noteId } = await params;
  return <NotebookPrint workspace={await load(id, noteId)} />;
}
