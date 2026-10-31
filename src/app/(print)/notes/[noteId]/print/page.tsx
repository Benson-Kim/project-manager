import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { parseProjectId as parseNoteId } from "@/app/(app)/projects/[id]/project-id";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { orNotFound } from "@/lib/row-access";
import { NotebookPrint } from "@/modules/notes/components/notebook-print";
import { notePrintHref } from "@/modules/notes/note-links";
import { getNoteWorkspace } from "@/modules/notes/repository/notes";

type Params = Promise<{ noteId: string }>;

/** One workspace read per request, shared by the title and the page. */
const load = cache(async (rawNoteId: string) => {
  const session = await auth.requireSession();
  const noteId = parseNoteId(rawNoteId);
  if (noteId === null) notFound();

  const workspace = await orNotFound(getNoteWorkspace(noteId, session.userId));
  if (workspace.note.ProjectId !== null) redirect(notePrintHref(workspace.note));
  return workspace;
});

/** The notebook's title names the saved PDF. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { note } = await load((await params).noteId);
  return { title: note.Title ?? messages.notes.untitled };
}

/**
 * A shared-space notebook on paper — /notes/[noteId]/print, outside the app
 * shell. A project's notebook prints under its project; one the actor cannot
 * open is not found.
 */
export default async function SharedNotePrintPage({ params }: { params: Params }) {
  return <NotebookPrint workspace={await load((await params).noteId)} />;
}
